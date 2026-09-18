import type { Socket } from "socket.io";
import {
    EmitEvent,
    EmitSchema,
    ListenSchema,
    TransferChunk,
    TransferPayload,
} from "@multi-indiegame/amflow-server-event-schema";

export interface ChunkedTransferSenderParameterObject {
    socket: Socket<ListenSchema, EmitSchema>;
    /** 1 チャンクあたりの ack 待ち上限。超過した転送は破棄する */
    ackTimeoutMs: number;
}

class TransferAbortedError extends Error {
    override name = "TransferAbortedError";
}

/**
 * 中断可能な転送 1 件分の状態。
 * `aborting` は中断時に reject される Promise で、ack 待ちを即座に打ち切るために使う。
 */
class Transfer {
    aborted: boolean;
    readonly aborting: Promise<never>;
    private _abort!: (err: Error) => void;

    constructor() {
        this.aborted = false;
        this.aborting = new Promise<never>((_resolve, reject) => {
            this._abort = reject;
        });
        // NOTE: 中断されなかった転送の Promise は誰にも await されずに残るため、
        // unhandled rejection にならないようダミーのハンドラを付けておく
        this.aborting.catch(() => {});
    }

    abort(reason: string) {
        if (this.aborted) {
            return;
        }
        this.aborted = true;
        this._abort(new TransferAbortedError(reason));
    }
}

let nextTransferSeq = 0;

/**
 * 巨大な応答を複数メッセージに分割し、クライアントの ack を待ちながら送出する。
 *
 * NOTE: Socket.IO / ws には送信キューの drain を待つ API が無く、emit したデータは
 * 送出完了まで内部キューに滞留する。低速なクライアントへ全ログ（数十 MB）を一括で
 * emit すると、その全量が送出完了までヒープに残り OOM の原因となる。
 * ack をクレジットとして次チャンクの生成を待たせることで、サーバが同時に保持する量を
 * チャンク 1 件分に抑え、かつ送出速度がクライアントの実効帯域に自動追従する。
 */
export class ChunkedTransferSender {
    _socket: Socket<ListenSchema, EmitSchema>;
    _ackTimeoutMs: number;
    _transfers: Map<string, Transfer>;

    constructor(param: ChunkedTransferSenderParameterObject) {
        this._socket = param.socket;
        this._ackTimeoutMs = param.ackTimeoutMs;
        this._transfers = new Map();
    }

    createTransferId() {
        return `${this._socket.id}-${nextTransferSeq++}`;
    }

    /**
     * `source` が yield したチャンクを順に送出する。
     * `source` は必ず 1 件以上 yield すること（最終チャンクに `last` を立てるため）。
     *
     * 転送の失敗（クライアント無応答・切断・キャンセル）はプレイ全体に波及させず、
     * ここで捕捉して打ち切る。
     *
     * @returns 送出して ack を得たチャンク数
     */
    async run<T extends TransferPayload>(
        transferId: string,
        source: AsyncIterable<T> | Iterable<T>,
    ) {
        const transfer = new Transfer();
        this._transfers.set(transferId, transfer);
        let sent = 0;
        try {
            let pending: T | undefined;
            let hasPending = false;
            for await (const payload of source) {
                if (transfer.aborted) {
                    throw new TransferAbortedError(
                        `transfer was aborted (transferId = ${transferId})`,
                    );
                }
                if (hasPending) {
                    await this._emitChunk(transfer, {
                        transferId,
                        seq: sent,
                        payload: pending!,
                        last: false,
                    });
                    sent++;
                }
                pending = payload;
                hasPending = true;
            }
            if (!hasPending) {
                throw new Error(
                    `source yielded no chunk (transferId = ${transferId})`,
                );
            }
            await this._emitChunk(transfer, {
                transferId,
                seq: sent,
                payload: pending!,
                last: true,
            });
            sent++;
        } catch (err) {
            console.warn(
                `chunked transfer was terminated (transferId = ${transferId})`,
                err,
            );
        } finally {
            this._transfers.delete(transferId);
        }
        return sent;
    }

    cancel(transferId: string) {
        this._transfers
            .get(transferId)
            ?.abort(`cancelled by client (transferId = ${transferId})`);
    }

    cancelAll(reason: string) {
        for (const transfer of this._transfers.values()) {
            transfer.abort(reason);
        }
    }

    private async _emitChunk(transfer: Transfer, chunk: TransferChunk) {
        if (transfer.aborted) {
            throw new TransferAbortedError(
                `transfer was aborted (transferId = ${chunk.transferId})`,
            );
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const acked = new Promise<void>((resolve, reject) => {
            timer = setTimeout(() => {
                reject(
                    new TransferAbortedError(
                        `ack timeout (transferId = ${chunk.transferId}, seq = ${chunk.seq})`,
                    ),
                );
            }, this._ackTimeoutMs);
            this._socket.emit(EmitEvent.TransferChunk, chunk, () => resolve());
        });
        // NOTE: race に敗れた側の rejection が unhandled にならないよう握りつぶす
        acked.catch(() => {});
        try {
            await Promise.race([acked, transfer.aborting]);
        } finally {
            clearTimeout(timer);
        }
    }
}
