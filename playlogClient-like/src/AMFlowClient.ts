import type { Socket } from "socket.io-client";
import { context, propagation } from "@opentelemetry/api";
import type {
    AMFlow,
    GetStartPointOptions,
    GetTickListOptions,
    Permission,
    StartPoint,
} from "@akashic/amflow";
import {
    Tick,
    Event,
    StorageKey,
    StorageValue,
    StorageReadKey,
    StorageData,
    TickList,
    TickIndex,
} from "@akashic/playlog";
import {
    EmitSchema,
    ListenSchema,
    ListenEvent,
    EmitEvent,
    TickPack,
    toTickList,
    toTickPack,
    PlayEndReason,
    PlayExtendPayload,
    BadRequestError,
    createAMFlowError,
    NotImplementedError,
    RuntimeError,
    TimeoutError,
    Carrier,
    TransferChunk,
} from "@multi-indiegame/amflow-client-event-schema";

/**
 * 分割転送中の応答を組み立てるための状態。
 * 全チャンクが揃った時点で、AMFlow の API として本来の `callback` を 1 度だけ呼ぶ。
 */
interface PendingTransferBase {
    /** 次に受け取るべきチャンクの seq */
    nextSeq: number;
    stallTimer: ReturnType<typeof setTimeout> | null;
}

interface PendingTickListTransfer extends PendingTransferBase {
    kind: "tickList";
    from: number;
    to: number;
    ticks: Tick[];
    callback: (err: Error | null, tickList?: TickList) => void;
}

interface PendingStartPointTransfer extends PendingTransferBase {
    kind: "startPoint";
    parts: string[];
    callback: (err: Error | null, startPoint?: StartPoint) => void;
}

type PendingTransfer = PendingTickListTransfer | PendingStartPointTransfer;

/**
 * 現在アクティブな trace context を Socket.IO イベントに載せるためのキャリアへ
 * inject する。OpenTelemetry SDK が未初期化（ブラウザでトレーシング無効など）の
 * 場合は no-op となり、空のキャリアを返す。
 */
const injectCarrier = (): Carrier => {
    const carrier: Carrier = {};
    propagation.inject(context.active(), carrier);
    return carrier;
};

interface AMFlowClientParameterObject {
    socket: Socket;
    /**
     * sendTick する際、このサイズになるまで送信を保留します。
     * Event が含まれている場合は即時送信します。
     * @default 0
     */
    maxPreservingTickSize?: number;
    /**
     * 分割転送中、次のチャンクが届かないまま経過したら転送を失敗扱いにする時間 (ms)。
     * @default 60000
     */
    transferStallTimeoutMs?: number;
}

export class AMFlowClient implements AMFlow {
    _socket: Socket<ListenSchema, EmitSchema>;
    _isOpened: boolean;
    _maxPreservingTickSize: number;
    _transferStallTimeoutMs: number;
    _transfers: Map<string, PendingTransfer>;
    /** close / 切断のたびに進む。応答が現行セッションのものか判定するために使う */
    _sessionGeneration: number;
    _preservingTicks: Tick[];
    _tickHandlers: ((tick: Tick) => void)[];
    _eventHandlers: ((event: Event) => void)[];
    _playEndHandlers: ((reason: PlayEndReason) => void)[];
    _playExtendHandlers: ((payload: PlayExtendPayload) => void)[];
    _onTickPackBound: ListenSchema[typeof ListenEvent.TickPack];
    _onEventBound: ListenSchema[typeof ListenEvent.Event];
    _onPlayEndBound: ListenSchema[typeof ListenEvent.PlayEnd];
    _onPlayExtendBound: ListenSchema[typeof ListenEvent.PlayExtend];
    _onTransferChunkBound: ListenSchema[typeof ListenEvent.TransferChunk];
    _onDisconnectBound: () => void;

    constructor(param: AMFlowClientParameterObject) {
        this._socket = param.socket;
        this._isOpened = false;
        this._maxPreservingTickSize = param.maxPreservingTickSize ?? 0;
        this._transferStallTimeoutMs = param.transferStallTimeoutMs ?? 60000;
        this._transfers = new Map();
        this._sessionGeneration = 0;
        this._preservingTicks = [];
        this._tickHandlers = [];
        this._eventHandlers = [];
        this._playEndHandlers = [];
        this._playExtendHandlers = [];
        this._onTickPackBound = this._onTickPack.bind(this);
        this._onEventBound = this._onEvent.bind(this);
        this._onPlayEndBound = this._onPlayEnd.bind(this);
        this._onPlayExtendBound = this._onPlayExtend.bind(this);
        this._onTransferChunkBound = this._onTransferChunk.bind(this);
        this._onDisconnectBound = this._onDisconnect.bind(this);
    }

    open(playId: string, callback?: (error: Error | null) => void) {
        if (this._assertsUnOpen(callback)) {
            this._socket.on(ListenEvent.TickPack, this._onTickPackBound);
            this._socket.on(ListenEvent.Event, this._onEventBound);
            this._socket.on(ListenEvent.PlayEnd, this._onPlayEndBound);
            this._socket.on(ListenEvent.PlayExtend, this._onPlayExtendBound);
            this._socket.on(
                ListenEvent.TransferChunk,
                this._onTransferChunkBound,
            );
            this._socket.on("disconnect", this._onDisconnectBound);
            this._socket.emit(EmitEvent.Open, playId, (err) => {
                this._isOpened = true;
                if (callback) {
                    if (err) {
                        callback(createAMFlowError(err));
                    } else {
                        callback(null);
                    }
                }
            });
        }
    }
    close(callback?: (error: Error | null) => void) {
        if (this._assertsOpen(callback)) {
            this._sessionGeneration++;
            this._failTransfers(
                new BadRequestError("session was closed."),
                true,
            );
            this._socket.off(ListenEvent.TickPack, this._onTickPackBound);
            this._socket.off(ListenEvent.Event, this._onEventBound);
            this._socket.off(ListenEvent.PlayEnd, this._onPlayEndBound);
            this._socket.off(ListenEvent.PlayExtend, this._onPlayExtendBound);
            this._socket.off(
                ListenEvent.TransferChunk,
                this._onTransferChunkBound,
            );
            this._socket.off("disconnect", this._onDisconnectBound);
            this._socket.emit(EmitEvent.Close, (err) => {
                if (!err) {
                    this._isOpened = false;
                }
                if (callback) {
                    if (err) {
                        callback(createAMFlowError(err));
                    } else {
                        callback(null);
                    }
                }
            });
        }
    }
    authenticate(
        token: string,
        callback: (error: Error | null, permission?: Permission) => void,
    ) {
        if (this._assertsOpen(callback)) {
            this._socket.emit(
                EmitEvent.Authenticate,
                token,
                injectCarrier(),
                (err, permission) => {
                    if (err) {
                        callback(createAMFlowError(err));
                    } else {
                        callback(null, permission);
                    }
                },
            );
        }
    }
    sendTick(tick: Tick) {
        if (this._assertsOpen()) {
            this._handleSendingTick(tick);
        }
    }
    onTick(handler: (tick: Tick) => void) {
        if (this._assertsOpen()) {
            this._tickHandlers.push(handler);
            if (this._tickHandlers.length === 1) {
                this._socket.emit(EmitEvent.SubscribeTick);
            }
        }
    }
    offTick(handler: (tick: Tick) => void) {
        if (this._assertsOpen()) {
            this._tickHandlers = this._tickHandlers.filter(
                (h) => h !== handler,
            );
            if (this._tickHandlers.length === 0) {
                this._socket.emit(EmitEvent.UnsubscribeTick);
            }
        }
    }
    sendEvent(event: Event) {
        if (this._assertsOpen()) {
            this._socket.emit(EmitEvent.SendEvent, event);
        }
    }
    onEvent(handler: (event: Event) => void) {
        if (this._assertsOpen()) {
            this._eventHandlers.push(handler);
            if (this._eventHandlers.length === 1) {
                this._socket.emit(EmitEvent.SubscribeEvent);
            }
        }
    }
    offEvent(handler: (event: Event) => void) {
        if (this._assertsOpen()) {
            this._eventHandlers = this._eventHandlers.filter(
                (h) => h !== handler,
            );
            if (this._eventHandlers.length === 0) {
                this._socket.emit(EmitEvent.UnsubscribeEvent);
            }
        }
    }
    /**
     * 独自の実装。プレイが外部要因で終了した際の通知を受ける
     */
    onPlayEnd(handler: (reason: PlayEndReason) => void) {
        this._playEndHandlers.push(handler);
    }
    offPlayEnd(handler: (reason: PlayEndReason) => void) {
        this._playEndHandlers = this._playEndHandlers.filter(
            (h) => h !== handler,
        );
    }
    /**
     * 独自の実装。プレイが延長された際の通知を受ける
     */
    onPlayExtend(handler: (payload: PlayExtendPayload) => void) {
        this._playExtendHandlers.push(handler);
    }
    offPlayExtend(handler: (payload: PlayExtendPayload) => void) {
        this._playExtendHandlers = this._playExtendHandlers.filter(
            (h) => h !== handler,
        );
    }

    getTickList(
        optsOrBegin: number | GetTickListOptions,
        endOrCallbeck:
            | number
            | ((err: Error | null, tickList?: TickList) => void),
        callback?: (err: Error | null, tickList?: TickList) => void,
    ) {
        if (
            typeof optsOrBegin === "number" &&
            typeof endOrCallbeck === "number" &&
            callback
        ) {
            this._requestTickList(
                { begin: optsOrBegin, end: endOrCallbeck },
                callback,
            );
        } else if (
            typeof optsOrBegin !== "number" &&
            typeof endOrCallbeck !== "number"
        ) {
            this._requestTickList(optsOrBegin, endOrCallbeck);
        }
    }

    /**
     * サーバは応答をチャンクに分けて送ってくるため、ヘッダを受け取った時点では
     * まだ完成していない。全チャンクが揃うまで `callback` の呼び出しを保留する。
     */
    _requestTickList(
        opts: GetTickListOptions,
        callback: (err: Error | null, tickList?: TickList) => void,
    ) {
        if (!this._assertsOpen(callback)) {
            return;
        }
        const generation = this._sessionGeneration;
        this._socket.emit(
            EmitEvent.GetTickList,
            opts,
            injectCarrier(),
            (err, header) => {
                if (
                    this._rejectStaleHeader(
                        generation,
                        header?.transferId,
                        callback,
                    )
                ) {
                    return;
                }
                if (err) {
                    callback(createAMFlowError(err));
                    return;
                }
                if (!header) {
                    callback(null, undefined); // NOTE: 対象 Tick が無いのは正常
                    return;
                }
                this._beginTransfer(header.transferId, {
                    kind: "tickList",
                    from: header.from,
                    to: header.to,
                    ticks: [],
                    nextSeq: 0,
                    stallTimer: null,
                    callback,
                });
            },
        );
    }
    putStartPoint(
        startPoint: StartPoint,
        callback: (error: Error | null) => void,
    ) {
        if (this._assertsOpen(callback)) {
            this._socket.emit(
                EmitEvent.PutStartPoint,
                startPoint,
                injectCarrier(),
                (err) => {
                    if (err) {
                        callback(createAMFlowError(err));
                    } else {
                        callback(null);
                    }
                },
            );
        }
    }
    getStartPoint(
        opts: GetStartPointOptions,
        callback: (error: Error | null, startPoint?: StartPoint) => void,
    ) {
        if (this._assertsOpen(callback)) {
            const generation = this._sessionGeneration;
            this._socket.emit(
                EmitEvent.GetStartPoint,
                opts,
                injectCarrier(),
                (err, header) => {
                    if (
                        this._rejectStaleHeader(
                            generation,
                            header?.transferId,
                            callback,
                        )
                    ) {
                        return;
                    }
                    if (err) {
                        callback(createAMFlowError(err));
                        return;
                    }
                    if (!header) {
                        callback(null, undefined); // NOTE: 対象 StartPoint が無いのは正常
                        return;
                    }
                    this._beginTransfer(header.transferId, {
                        kind: "startPoint",
                        parts: [],
                        nextSeq: 0,
                        stallTimer: null,
                        callback,
                    });
                },
            );
        }
    }
    putStorageData(
        key: StorageKey,
        value: StorageValue,
        options: any,
        callback: (err: Error | null) => void,
    ) {
        callback(new NotImplementedError("not supported"));
    }
    getStorageData(
        keys: StorageReadKey[],
        callback: (error: Error | null, values?: StorageData[]) => void,
    ) {
        callback(new NotImplementedError("not supported"));
    }

    _onTickPack(tickPack: TickPack) {
        for (const tick of toTickList(tickPack)) {
            for (const handler of this._tickHandlers) {
                handler(tick);
            }
        }
    }

    _onEvent(event: Event) {
        for (const handler of this._eventHandlers) {
            handler(event);
        }
    }

    _onPlayEnd(reason: PlayEndReason) {
        for (const handler of this._playEndHandlers) {
            handler(reason);
        }
    }

    _onPlayExtend(payload: PlayExtendPayload) {
        for (const handler of this._playExtendHandlers) {
            handler(payload);
        }
    }

    _onDisconnect() {
        this._sessionGeneration++;
        this._failTransfers(
            new RuntimeError("socket was disconnected during transfer."),
            false,
        );
    }

    /**
     * ヘッダの ack が届く前に close / 切断された場合、その転送を登録しても
     * チャンクを消費する経路が既に外れており、誰にも完了させられない。
     * 呼び出し元のコールバックを即座に解決し、宙に浮いたタイマーを残さない。
     */
    _rejectStaleHeader(
        generation: number,
        transferId: string | undefined,
        callback: (err: Error | null) => void,
    ) {
        if (generation === this._sessionGeneration) {
            return false;
        }
        if (transferId != null) {
            this._socket.emit(EmitEvent.CancelTransfer, transferId);
        }
        callback(new BadRequestError("session was closed."));
        return true;
    }

    _onTransferChunk(chunk: TransferChunk, ack: () => void) {
        const transfer = this._transfers.get(chunk.transferId);
        if (!transfer) {
            // NOTE: キャンセル済みの転送。サーバの送出ループを止めないため ack だけ返す
            ack();
            return;
        }
        // NOTE: 同一コネクション上では順序が保たれるため、ずれていれば
        // 取りこぼしが起きている。無音のまま壊れたデータを返さないよう失敗させる
        if (chunk.seq !== transfer.nextSeq) {
            ack();
            this._abortTransfer(
                chunk.transferId,
                new RuntimeError(
                    `unexpected chunk order. expected ${transfer.nextSeq} but ${chunk.seq}`,
                ),
            );
            return;
        }
        if (transfer.kind === "tickList") {
            if (!Array.isArray(chunk.payload)) {
                ack();
                this._abortTransfer(
                    chunk.transferId,
                    new RuntimeError("unexpected payload for tickList."),
                );
                return;
            }
            for (const tick of chunk.payload) {
                transfer.ticks.push(tick);
            }
        } else {
            if (typeof chunk.payload !== "string") {
                ack();
                this._abortTransfer(
                    chunk.transferId,
                    new RuntimeError("unexpected payload for startPoint."),
                );
                return;
            }
            transfer.parts.push(chunk.payload);
        }
        transfer.nextSeq++;
        ack();
        if (!chunk.last) {
            this._armStallTimer(chunk.transferId, transfer);
            return;
        }
        this._finishTransfer(chunk.transferId);
        this._completeTransfer(transfer);
    }

    _completeTransfer(transfer: PendingTransfer) {
        if (transfer.kind === "tickList") {
            transfer.callback(
                null,
                transfer.ticks.length > 0
                    ? [transfer.from, transfer.to, transfer.ticks]
                    : [transfer.from, transfer.to],
            );
            return;
        }
        let startPoint: StartPoint;
        try {
            startPoint = JSON.parse(transfer.parts.join("")) as StartPoint;
        } catch (err) {
            transfer.callback(
                new RuntimeError(`failed to parse startPoint. ${err}`),
            );
            return;
        }
        transfer.callback(null, startPoint);
    }

    _beginTransfer(transferId: string, transfer: PendingTransfer) {
        this._transfers.set(transferId, transfer);
        this._armStallTimer(transferId, transfer);
    }

    _armStallTimer(transferId: string, transfer: PendingTransfer) {
        if (transfer.stallTimer != null) {
            clearTimeout(transfer.stallTimer);
        }
        transfer.stallTimer = setTimeout(() => {
            this._abortTransfer(
                transferId,
                new TimeoutError(
                    `no chunk arrived in ${this._transferStallTimeoutMs} ms.`,
                ),
            );
        }, this._transferStallTimeoutMs);
    }

    _finishTransfer(transferId: string) {
        const transfer = this._transfers.get(transferId);
        if (!transfer) {
            return null;
        }
        if (transfer.stallTimer != null) {
            clearTimeout(transfer.stallTimer);
            transfer.stallTimer = null;
        }
        this._transfers.delete(transferId);
        return transfer;
    }

    /**
     * 転送を打ち切り、サーバ側の送出も止める
     */
    _abortTransfer(transferId: string, err: Error) {
        const transfer = this._finishTransfer(transferId);
        if (!transfer) {
            return;
        }
        this._socket.emit(EmitEvent.CancelTransfer, transferId);
        transfer.callback(err);
    }

    _failTransfers(err: Error, notifyServer: boolean) {
        for (const transferId of [...this._transfers.keys()]) {
            const transfer = this._finishTransfer(transferId);
            if (!transfer) {
                continue;
            }
            if (notifyServer) {
                this._socket.emit(EmitEvent.CancelTransfer, transferId);
            }
            transfer.callback(err);
        }
    }

    _assertsUnOpen(cb?: (err: Error | null, ...data: any[]) => void) {
        if (this._isOpened) {
            if (cb) {
                cb(new BadRequestError("session is already opened."));
            }
            return false;
        }
        return true;
    }

    _assertsOpen(cb?: (err: Error | null, ...data: any[]) => void) {
        if (!this._isOpened) {
            if (cb) {
                cb(new BadRequestError("session isn't opened."));
            }
            return false;
        }
        return true;
    }

    _handleSendingTick(tick: Tick) {
        this._preservingTicks.push(tick);
        if (
            tick[TickIndex.Events] ||
            this._preservingTicks.length >= this._maxPreservingTickSize
        ) {
            const carrier = injectCarrier();
            for (const pack of toTickPack(this._preservingTicks)) {
                this._socket.emit(EmitEvent.SendTickPack, pack, carrier);
            }
            this._preservingTicks = [];
        }
    }
}
