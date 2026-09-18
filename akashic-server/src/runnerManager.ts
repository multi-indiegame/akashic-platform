import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";
import { Runner, RunnerParameterObject } from "./runner";
import type { RunnerClient } from "./runnerClient";

interface RunnerManagerParameterObject {
    publicWebappUrl: string;
    storagePublicUrl: string;
    storageAdminUrl: string;
    storageAdminToken: string;
    maxPreservingTickSize: number;
    runnerClient: RunnerClient;
}

export type RunnerStartParameterObject = Omit<
    RunnerParameterObject,
    | "playId"
    | "playToken"
    | "publicWebappUrl"
    | "storagePublicUrl"
    | "storageAdminUrl"
    | "storageAdminToken"
    | "maxPreservingTickSize"
    | "runnerClient"
>;

export class RunnerManager {
    _publicWebappUrl: string;
    _storagePublicUrl: string;
    _storageAdminUrl: string;
    _storageAdminToken: string;
    _maxPreservingTickSize: number;
    _runnerClient: RunnerClient;
    _runners: Map<number, Runner>;

    constructor(param: RunnerManagerParameterObject) {
        this._publicWebappUrl = param.publicWebappUrl;
        this._storagePublicUrl = param.storagePublicUrl;
        this._storageAdminUrl = param.storageAdminUrl;
        this._storageAdminToken = param.storageAdminToken;
        this._maxPreservingTickSize = param.maxPreservingTickSize;
        this._runnerClient = param.runnerClient;
        this._runners = new Map();
    }

    async start(param: RunnerStartParameterObject) {
        const runner = new Runner({
            publicWebappUrl: this._publicWebappUrl,
            storagePublicUrl: this._storagePublicUrl,
            storageAdminUrl: this._storageAdminUrl,
            storageAdminToken: this._storageAdminToken,
            maxPreservingTickSize: this._maxPreservingTickSize,
            runnerClient: this._runnerClient,
            ...param,
        });
        const playId = await runner.createPlay();
        this._runners.set(playId, runner);
        try {
            await runner.run();
        } catch (err) {
            this._runners.delete(playId);
            throw err;
        }
        return playId;
    }

    get(playId: number) {
        return this._runners.get(playId);
    }

    async end(
        playId: number,
        reason: PlayEndReason,
        notifyPlaylogServer = true,
    ) {
        const runner = this._runners.get(playId);
        if (runner) {
            await runner.end(reason, notifyPlaylogServer);
        }
    }

    unregister(playId: number) {
        this._runners.delete(playId);
    }

    getRemaining(playId: number) {
        return this._runners.get(playId)?.getRemaining();
    }

    async extend(playId: number) {
        const runner = this._runners.get(playId);
        if (!runner) {
            return { ok: false, reason: "NotFound" } as const;
        }
        return await runner.extend();
    }

    async destroy() {
        await Promise.all(
            [...this._runners.entries()].map(async ([playId, runner]) => {
                console.log(
                    `runner (playId = "${playId}") is destroying forcibly.`,
                );
                await runner.end("INTERNAL_ERROR");
            }),
        );
    }
}
