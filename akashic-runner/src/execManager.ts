import type {
    StartPlayRequest,
    StopPlayResponse,
} from "@multi-indiegame/runner-ipc-schema";
import type { ControlClient } from "./controlClient";
import { PlayWorker } from "./playWorker";

export interface ExecManagerParameterObject {
    control: ControlClient;
    serverUrl: string;
    serverToken: string;
    stallTimeoutMs: number;
    maxHeapMb: number;
    onChange?: (playIds: number[]) => void;
}

export class ExecManager {
    _param: ExecManagerParameterObject;
    _workers: Map<number, PlayWorker>;

    constructor(param: ExecManagerParameterObject) {
        this._param = param;
        this._workers = new Map();
    }

    async start(req: StartPlayRequest) {
        if (this._workers.has(req.playId)) {
            throw new Error(`play ${req.playId} already running`);
        }
        const worker = new PlayWorker({
            req,
            control: this._param.control,
            serverUrl: this._param.serverUrl,
            serverToken: this._param.serverToken,
            stallTimeoutMs: this._param.stallTimeoutMs,
            maxHeapMb: this._param.maxHeapMb,
        });
        this._set(req.playId, worker);
        try {
            await worker.start();
        } catch (err) {
            // WHY: 起動中に停止要求が来たときは、そちらが先に取り除いている
            if (this._workers.get(req.playId) === worker) {
                this._delete(req.playId);
            }
            throw err;
        }
    }

    async stop(playId: number) {
        const worker = this._workers.get(playId);
        if (!worker) {
            return {
                ok: true,
                crashed: false,
                errorLogged: false,
                // WHY: 動いていない runner からは、記録が届いたと言い切れない
                scoreDelivered: false,
            } as StopPlayResponse;
        }
        this._delete(playId);
        return await worker.stop();
    }

    async destroy() {
        await Promise.all(
            [...this._workers.entries()].map(async ([playId, worker]) => {
                console.log(
                    `exec runner (playId = "${playId}") is destroying.`,
                );
                await worker.stop();
            }),
        );
        this._workers.clear();
    }

    _set(playId: number, worker: PlayWorker) {
        this._workers.set(playId, worker);
        this._param.onChange?.([...this._workers.keys()]);
    }

    _delete(playId: number) {
        this._workers.delete(playId);
        this._param.onChange?.([...this._workers.keys()]);
    }
}
