import type {
    StartPlayRequest,
    StopPlayResponse,
} from "@multi-indiegame/runner-ipc-schema";
import type { ControlClient } from "./controlClient";
import { ExecRunner } from "./execRunner";

export class ExecManager {
    _control: ControlClient;
    _runners: Map<number, ExecRunner>;

    constructor(control: ControlClient) {
        this._control = control;
        this._runners = new Map();
    }

    async start(req: StartPlayRequest) {
        if (this._runners.has(req.playId)) {
            throw new Error(`play ${req.playId} already running`);
        }
        const runner = new ExecRunner(req, this._control);
        this._runners.set(req.playId, runner);
        try {
            await runner.start();
        } catch (err) {
            this._runners.delete(req.playId);
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
            } as StopPlayResponse;
        }
        this._runners.delete(playId);
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
}
