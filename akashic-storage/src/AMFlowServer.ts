import type { Socket } from "socket.io";
import type {
    GetStartPointOptions,
    GetTickListOptions,
    StartPoint,
} from "@akashic/amflow";
import type { Event } from "@akashic/playlog";
import {
    EmitEvent,
    TickPack,
    ListenSchema,
    ListenEvent,
    PlayEndReason,
    PlayExtendPayload,
} from "@multi-indiegame/amflow-server-event-schema";
import { ValkeyAMFlowStore } from "./ValkeyAMFlowStore";

interface AMFlowServerParameterObject {
    playId: string;
    store: ValkeyAMFlowStore;
}

export class AMFlowServer {
    _playId: string;
    _store: ValkeyAMFlowStore;
    _clients: Set<Socket>;
    // 認証に使われた token を socket 単位で覚えておく。BAN 時に
    // 対象の playToken を持つ socket だけを狙って切断するために使う。
    _socketTokens: Map<Socket, string>;
    _tickSubscribers: Set<Socket>;
    _eventSubscribers: Set<Socket>;
    // store からの tick 購読ハンドラ。SendTickPack イベント自体ではなく
    // _broadcastTick のシグネチャ（carrier を含まない）に合わせる。
    _broadcastTickBound: (tickPack: TickPack) => void;
    _broadcastEventBound: ListenSchema[typeof ListenEvent.SendEvent];

    constructor(param: AMFlowServerParameterObject) {
        this._playId = param.playId;
        this._store = param.store;
        this._tickSubscribers = new Set();
        this._eventSubscribers = new Set();
        this._clients = new Set();
        this._socketTokens = new Map();
        this._broadcastTickBound = this._broadcastTick.bind(this);
        this._broadcastEventBound = this._broadcastEvent.bind(this);
        this._store.onTick(this._broadcastTickBound);
        this._store.onEvent(this._broadcastEventBound);
    }

    getPlayId() {
        return this._playId;
    }

    async generateToken(isActive: boolean) {
        return await this._store.createPlayToken(
            isActive ? "active" : "passive",
        );
    }

    join(socket: Socket) {
        this._clients.add(socket);
    }

    leave(socket: Socket) {
        this.unsubscribeTick(socket);
        this.unsubscribeEvent(socket);
        this._clients.delete(socket);
        this._socketTokens.delete(socket);
    }

    async authenticate(socket: Socket, token: string) {
        const permission = await this._store.authenticate(token);
        this._socketTokens.set(socket, token);
        return permission;
    }

    /**
     * 指定した playToken で認証済みの socket を即時切断し、token を失効させる。
     * 切断だけでは同じ token で再認証できてしまうため、Valkey からも消す。
     *
     * 失効を切断より先に行う。逆順だと、失効の await 中に対象 token で認証を
     * 済ませた socket が切断ループを通過した後に残り、生き残ってしまう。
     * 先に失効させておけば、以降の認証は token 無しで失敗し、失効 await 中に
     * 認証を終えた socket は後続の切断ループで捕捉できる。
     */
    async kick(playToken: string) {
        await this._store.revokeToken(playToken);
        for (const [socket, token] of this._socketTokens) {
            if (token === playToken) {
                socket.disconnect(true);
            }
        }
    }

    async sendTickPack(tickPack: TickPack) {
        await this._store.sendTickPack(tickPack);
    }

    sendEvent(event: Event) {
        this._store.sendEvent(event);
    }

    subscribeTick(socket: Socket) {
        this._tickSubscribers.add(socket);
    }

    unsubscribeTick(socket: Socket) {
        this._tickSubscribers.delete(socket);
    }

    subscribeEvent(socket: Socket) {
        this._eventSubscribers.add(socket);
    }

    unsubscribeEvent(socket: Socket) {
        this._eventSubscribers.delete(socket);
    }

    openTickListTransfer(opts: GetTickListOptions) {
        return this._store.openTickListTransfer(opts);
    }

    async openStartPointTransfer(opts: GetStartPointOptions) {
        return await this._store.openStartPointTransfer(opts);
    }

    async putStartPoint(startPoint: StartPoint) {
        await this._store.putStartPoint(startPoint);
    }

    broadcastPlayEnd(reason: PlayEndReason) {
        for (const client of this._clients) {
            client.emit(EmitEvent.PlayEnd, reason);
        }
    }

    broadcastPlayExtend(payload: PlayExtendPayload) {
        for (const client of this._clients) {
            client.emit(EmitEvent.PlayExtend, payload);
        }
    }

    getParticipants() {
        // アクティブインスタンスの接続数を除いている
        return Math.max(this._clients.size - 1, 0);
    }

    async destroy(reason: PlayEndReason) {
        this.broadcastPlayEnd(reason);
        this._store.offTick(this._broadcastTickBound);
        this._store.offEvent(this._broadcastEventBound);
        this._tickSubscribers.clear();
        this._eventSubscribers.clear();
        await Promise.all(
            [...this._clients.values()].map(async (socket) =>
                socket.disconnect(true),
            ),
        );
        await this._store.destroy();
    }

    _broadcastTick(tickPack: TickPack) {
        for (const client of this._tickSubscribers) {
            client.emit(EmitEvent.TickPack, tickPack);
        }
    }

    _broadcastEvent(event: Event) {
        for (const client of this._eventSubscribers) {
            client.emit(EmitEvent.Event, event);
        }
    }
}
