import type {
    StartPlayRequest,
    StopPlayResponse,
} from "@multi-indiegame/runner-ipc-schema";
import type { ControlClient } from "./controlClient";
import { ExecRunner } from "./execRunner";

export class ExecManager {
    _control: ControlClient;
    _runners: Map<number, ExecRunner>;
    _onChange?: (playIds: number[]) => void;

    constructor(
        control: ControlClient,
        onChange?: (playIds: number[]) => void,
    ) {
        this._control = control;
        this._runners = new Map();
        this._onChange = onChange;
    }

    async start(req: StartPlayRequest) {
        if (this._runners.has(req.playId)) {
            throw new Error(`play ${req.playId} already running`);
        }
        const runner = new ExecRunner(req, this._control);
        this._set(req.playId, runner);
        try {
            await runner.start();
        } catch (err) {
            this._delete(req.playId);
            // WHY: 開いたままの socket は storage への再接続を繰り返し続ける
            await runner.stop().catch((e) => {
                console.warn(
                    "failed to clean up exec runner",
                    { playId: req.playId },
                    e,
                );
            });
            throw err;
        }
    }

    async stop(playId: number) {
        const runner = this._runners.get(playId);
        if (!runner) {
            return {
                ok: true,
                crashed: false,
                errorLogged: false,
                // WHY: 動いていない runner からは、記録が届いたと言い切れない
                scoreDelivered: false,
            } as StopPlayResponse;
        }
        this._delete(playId);
        return await runner.stop();
    }

    async destroy() {
        await Promise.all(
            [...this._runners.entries()].map(async ([playId, runner]) => {
                console.log(
                    `exec runner (playId = "${playId}") is destroying.`,
                );
                await runner.stop();
            }),
        );
        this._runners.clear();
    }

    _set(playId: number, runner: ExecRunner) {
        this._runners.set(playId, runner);
        this._onChange?.([...this._runners.keys()]);
    }

    _delete(playId: number) {
        this._runners.delete(playId);
        this._onChange?.([...this._runners.keys()]);
    }
}
