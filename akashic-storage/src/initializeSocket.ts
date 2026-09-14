import type { Socket } from "socket.io";
import {
    trace,
    context,
    propagation,
    SpanKind,
    SpanStatusCode,
    Span,
    Attributes,
} from "@opentelemetry/api";
import type { Permission } from "@akashic/amflow";
import type { Event, Tick } from "@akashic/playlog";
import {
    ListenSchema,
    EmitSchema,
    ListenEvent,
    AMFlowError,
    AMFlowErrorName,
    amflowErrorNames,
    AMFlowErrorNameType,
    BadRequestError,
    PermissionError,
    Carrier,
    sliceTransferData,
} from "@yasshi2525/amflow-server-event-schema";
import { AMFlowServerManager } from "./AMFlowServerManager";
import { AMFlowServer } from "./AMFlowServer";
import { ChunkedTransferSender } from "./ChunkedTransferSender";
import { applyBaggageAttributes } from "./tracingAttributes";

export interface InitializeSocketParameterObject {
    /** 1 チャンクあたりの ack 待ち上限。超過した転送は破棄する */
    ackTimeoutMs: number;
    /** StartPoint を分割転送する際の 1 チャンクあたりの文字数 */
    startPointChunkSize: number;
}

const tracer = trace.getTracer("akashic-storage.amflow");

/**
 * クライアントから伝播された trace context（carrier）を復元したうえで、
 * AMFlow イベント処理を 1 本のサーバースパンとして計測する。
 * これにより「クライアント emit → Socket.IO → ハンドラ → Valkey」までが
 * 1 トレースに連なり、どの区間で時間を要しているかを可視化できる。
 */
const withAmflowSpan = async <T>(
    name: string,
    carrier: Carrier | undefined,
    attributes: Attributes,
    fn: (span: Span) => Promise<T> | T,
): Promise<T> => {
    const ctx = propagation.extract(context.active(), carrier ?? {});
    return context.with(ctx, () =>
        tracer.startActiveSpan(
            name,
            { kind: SpanKind.SERVER, attributes },
            async (span) => {
                applyBaggageAttributes(span);
                try {
                    return await fn(span);
                } catch (err) {
                    span.recordException(err as Error);
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    throw err;
                } finally {
                    span.end();
                }
            },
        ),
    );
};

/** 実行基盤が予約する playerId の接頭辞 */
const RESERVED_PLAYER_ID_PREFIX = ":";

const isReservedPlayerIdEvent = (event: Event): boolean => {
    const playerId = event[2];
    return (
        typeof playerId === "string" &&
        playerId.startsWith(RESERVED_PLAYER_ID_PREFIX)
    );
};

export const initializeSocket = (
    socket: Socket<ListenSchema, EmitSchema>,
    amfManager: AMFlowServerManager,
    param: InitializeSocketParameterObject,
) => {
    let server: AMFlowServer | null = null;
    let permission: Permission | null = null;
    const transferSender = new ChunkedTransferSender({
        socket,
        ackTimeoutMs: param.ackTimeoutMs,
    });
    const assertsUnOpen = () => {
        if (server) {
            throw new BadRequestError("session was already opened.");
        }
    };
    const assertsOpen = () => {
        if (server == null) {
            throw new BadRequestError("session is not opened.");
        }
    };
    const handleError = (
        err: unknown,
        cb: (err: AMFlowError | null, ...data: any[]) => void,
    ) => {
        if (
            err instanceof Error &&
            amflowErrorNames.some((name) => name === err.name)
        ) {
            cb({
                name: err.name as AMFlowErrorNameType,
                message: err.message,
            });
        } else {
            cb({
                name: AMFlowErrorName.RuntimeError,
                message: "unknown error is occurred.",
            });
        }
    };
    socket.on("disconnect", () => {
        transferSender.cancelAll(`socket was disconnected (id = ${socket.id})`);
        amfManager.onDisconnect(socket);
    });
    socket.on(ListenEvent.CancelTransfer, (transferId) => {
        transferSender.cancel(transferId);
    });
    socket.on(ListenEvent.Open, (playId, cb) => {
        try {
            assertsUnOpen();
            server = amfManager.getServer(playId);
            server.join(socket);
            cb(null);
        } catch (err) {
            handleError(err, cb);
        }
    });
    socket.on(ListenEvent.Close, (cb) => {
        try {
            assertsOpen();
            transferSender.cancelAll("session was closed");
            server!.leave(socket);
            server = null;
            cb(null);
        } catch (err) {
            handleError(err, cb);
        }
    });
    socket.on(ListenEvent.Authenticate, async (token, carrier, cb) => {
        await withAmflowSpan(
            "amflow.authenticate",
            carrier,
            { "amflow.event": ListenEvent.Authenticate },
            async () => {
                try {
                    assertsOpen();
                    permission = await server!.authenticate(socket, token);
                    cb(null, permission);
                } catch (err) {
                    handleError(err, cb);
                }
            },
        );
    });
    socket.on(ListenEvent.SendTickPack, async (tickPack, carrier) => {
        await withAmflowSpan(
            "amflow.sendTickPack",
            carrier,
            { "amflow.event": ListenEvent.SendTickPack },
            async () => {
                try {
                    assertsOpen();
                    if (!permission?.writeTick) {
                        return;
                    }
                    await server!.sendTickPack(tickPack);
                } catch (err) {}
            },
        );
    });
    socket.on(ListenEvent.SendEvent, (event) => {
        try {
            assertsOpen();
            if (!permission?.sendEvent) {
                return;
            }
            // 予約 playerId (":" 始まり) を名乗るイベントは、サーバーが注入する
            // 拡張向け通知をクライアントから偽装できてしまうため破棄する。ただし
            // 実行基盤が起動時に ":akashic" の start 通知を送るので、tick 書き込み
            // 権限を持つ active インスタンスだけは通す。
            //
            // WHY: これは拡張の仕様が課す義務ではなく、本サイト側の自主的な堅牢化。
            // 誰に何を許すかは実行基盤の裁量とされている
            if (!permission.writeTick && isReservedPlayerIdEvent(event)) {
                return;
            }
            server!.sendEvent(event);
        } catch (err) {}
    });
    socket.on(ListenEvent.SubscribeTick, () => {
        try {
            assertsOpen();
            if (!permission?.subscribeTick) {
                return;
            }
            server!.subscribeTick(socket);
        } catch (err) {}
    });
    socket.on(ListenEvent.UnsubscribeTick, () => {
        try {
            assertsOpen();
            server!.unsubscribeTick(socket);
        } catch (err) {}
    });
    socket.on(ListenEvent.SubscribeEvent, () => {
        try {
            assertsOpen();
            if (!permission?.subscribeEvent) {
                return;
            }
            server!.subscribeEvent(socket);
        } catch (err) {}
    });
    socket.on(ListenEvent.UnsubscribeEvent, () => {
        try {
            assertsOpen();
            server!.unsubscribeEvent(socket);
        } catch (err) {}
    });
    socket.on(ListenEvent.GetTickList, async (opts, carrier, cb) => {
        await withAmflowSpan(
            "amflow.getTickList",
            carrier,
            {
                "amflow.event": ListenEvent.GetTickList,
                "amflow.tick.begin": opts.begin,
                "amflow.tick.end": opts.end,
            },
            async (span) => {
                let transferId: string;
                let chunks: AsyncGenerator<Tick[]>;
                try {
                    assertsOpen();
                    if (!permission?.readTick) {
                        throw new PermissionError();
                    }
                    const transfer = server!.openTickListTransfer(opts);
                    if (!transfer) {
                        cb(null, null); // NOTE: 対象 Tick が無いのは正常
                        return;
                    }
                    transferId = transferSender.createTransferId();
                    chunks = transfer.chunks;
                    // NOTE: ヘッダ(ack)とチャンクは同一コネクション上で順序が保たれるため、
                    // クライアントは転送 ID を知った後にチャンクを受け取れる
                    cb(null, {
                        transferId,
                        from: transfer.from,
                        to: transfer.to,
                    });
                } catch (err) {
                    handleError(err, cb);
                    return;
                }
                const sent = await transferSender.run(transferId, chunks);
                span.setAttribute("amflow.transfer.chunk.count", sent);
            },
        );
    });
    socket.on(ListenEvent.GetStartPoint, async (opts, carrier, cb) => {
        await withAmflowSpan(
            "amflow.getStartPoint",
            carrier,
            { "amflow.event": ListenEvent.GetStartPoint },
            async (span) => {
                let transferId: string;
                let chunks: string[];
                try {
                    assertsOpen();
                    if (!permission?.readTick) {
                        throw new PermissionError();
                    }
                    const requested = server;
                    const raw = await requested!.openStartPointTransfer(opts);
                    // NOTE: Valkey 読み出し中に切断・クローズされた場合、その時点の
                    // cancelAll ではこの転送はまだ登録されておらず対象外になる。
                    // 読み出し後にセッションを確認しないと、無効な接続に対して
                    // 数 MB のスナップショットを ack タイムアウトまで抱え続けてしまう
                    if (server !== requested || !socket.connected) {
                        throw new BadRequestError(
                            "session was closed while loading startPoint.",
                        );
                    }
                    if (raw == null) {
                        cb(null, null); // NOTE: 対象 StartPoint が無いのは正常
                        return;
                    }
                    transferId = transferSender.createTransferId();
                    chunks = sliceTransferData(raw, param.startPointChunkSize);
                    cb(null, { transferId });
                } catch (err) {
                    handleError(err, cb);
                    return;
                }
                const sent = await transferSender.run(transferId, chunks);
                span.setAttribute("amflow.transfer.chunk.count", sent);
            },
        );
    });
    socket.on(ListenEvent.PutStartPoint, async (startPoint, carrier, cb) => {
        await withAmflowSpan(
            "amflow.putStartPoint",
            carrier,
            {
                "amflow.event": ListenEvent.PutStartPoint,
                "amflow.startPoint.frame": startPoint.frame,
            },
            async () => {
                try {
                    assertsOpen();
                    if (!permission?.writeTick) {
                        throw new PermissionError();
                    }
                    await server!.putStartPoint(startPoint);
                    cb(null);
                } catch (err) {
                    handleError(err, cb);
                }
            },
        );
    });
    amfManager.onConnect(socket);
};
