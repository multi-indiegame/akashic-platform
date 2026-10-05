import { io, ManagerOptions, Socket, SocketOptions } from "socket.io-client";
import { ProtocolType } from "./akashic-gameview";
import { AMFlowClient } from "./AMFlowClient";

export interface CreateClientParameterObject {
    usePrimaryChannel: boolean;
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

export interface PlayInfo {
    playId: string;
    token: string;
}

export interface SessionOptions {
    /**
     * {@link ProtocolType}
     */
    socketType: number;
    validationData: PlayInfo;
    socketOpts?: SocketOptions | null;
}

export class SessionLike {
    _url: URL;
    _validationData: PlayInfo;
    _socketOptions: SocketOptions | null | undefined;
    _errorListeners: ((err: Error) => void)[] = [];
    _socket: Socket | null;
    _onErrorBound: (err: Error) => void;

    constructor(url: string, opts: SessionOptions) {
        if (opts.socketType !== ProtocolType.WebSocket) {
            throw new Error(
                `unsupported socket type value = ${opts.socketType}`,
            );
        }
        this._url = new URL(url);
        this._validationData = opts.validationData;
        this._socketOptions = opts.socketOpts;
        this._socket = null;
        this._onErrorBound = this._onError.bind(this);
    }

    open(cb: (err: Error | null) => void) {
        if (this._socket) {
            cb(new Error("socket was already connetcted."));
            return;
        }
        const opts: Partial<ManagerOptions & SocketOptions> = {
            path: this._url.pathname,
            ...this._socketOptions,
        };
        this._socket = io(this._url.origin, opts);
        this._socket.io.on("open", () => {
            cb(null);
        });
        this._socket.io.on("error", this._onErrorBound);
    }

    on(type: "error", cb: (err: Error) => void) {
        if (type !== "error") {
            throw new Error(`unsupported event type = ${type}`);
        }
        this._errorListeners.push(cb);
    }

    close(cb: (msg: string) => void) {
        if (!this._socket) {
            cb("socket was already disconnected.");
            return;
        }
        this._socket.io.off("error", this._onErrorBound);
        // WHY: socket.io は接続していない socket に disconnect() しても
        // disconnect イベントを出さないため、待つと cb が永久に呼ばれない
        if (!this._socket.connected) {
            this._socket.disconnect();
            this._socket = null;
            cb("socket was not connected.");
            return;
        }
        this._socket.on("disconnect", (reason) => {
            cb(reason);
            this._socket = null;
        });
        this._socket.disconnect();
    }

    createClient(
        opts: CreateClientParameterObject,
        cb: (err: Error | null, client: AMFlowClient | null) => void,
    ) {
        if (!this._socket) {
            cb(new Error("socket was already disconnected."), null);
        }
        const client = new AMFlowClient({
            socket: this._socket!,
            maxPreservingTickSize: opts.maxPreservingTickSize,
            transferStallTimeoutMs: opts.transferStallTimeoutMs,
        });
        cb(null, client);
    }

    _onError(err: Error) {
        for (const cb of this._errorListeners) {
            cb(err);
        }
    }
}
