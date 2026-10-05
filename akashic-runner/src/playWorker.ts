import path from "node:path";
import { Worker } from "node:worker_threads";
import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";
import type {
    PlayEndOrigin,
    StartPlayRequest,
    StopPlayResponse,
} from "@multi-indiegame/runner-ipc-schema";
import type { ControlClient } from "./controlClient";
import type { ExecResult } from "./execRunner";
import { formatLine } from "./logger";
import type { LogSender } from "./logSender";
import type {
    FromPlayWorker,
    PlayWorkerData,
    ToPlayWorker,
} from "./playWorkerMessage";
import type { ScoreSender } from "./scoreSender";

const CHECK_INTERVAL_MS = 1000;
// WHY: 停止の中で worker がするのはゲームと storage との接続を閉じることだけ。
// 記録とログはメインスレッドが送るので、ここで長く待つ理由はない
const STOP_TIMEOUT_MS = 10000;

export interface PlayWorkerParameterObject {
    req: StartPlayRequest;
    control: ControlClient;
    serverUrl: string;
    serverToken: string;
    stallTimeoutMs: number;
}

type State = "idle" | "starting" | "running" | "stopping" | "ended";

/**
 * 1 プレイの投稿スクリプトを専用の worker thread で動かす。
 *
 * WHY: 投稿スクリプトが無限ループなどで止まっても、ほかのプレイと
 * akashic-runner の応答を巻き込まないようにする。止まった worker は外から
 * terminate() で打ち切れる。記録とログはメインスレッドで持ち、worker を
 * 打ち切った後も、そこまでの分を akashic-server へ送り切る。
 */
export class PlayWorker {
    _param: PlayWorkerParameterObject;
    _state: State = "idle";
    _worker?: Worker;
    _logSender: LogSender;
    _scoreSender?: ScoreSender;
    _lastBeatAt = 0;
    _checkTimer?: NodeJS.Timeout;
    _aborted = false;
    _onStarted?: { resolve: () => void; reject: (err: Error) => void };
    _onStopped?: (result: ExecResult | null) => void;

    constructor(param: PlayWorkerParameterObject) {
        this._param = param;
        this._logSender = param.control.openLogSender(param.req.playId);
        if (param.req.scoreboard) {
            this._scoreSender = param.control.openScoreSender(param.req.playId);
        }
    }

    get playId() {
        return this._param.req.playId;
    }

    async start() {
        this._state = "starting";
        const started = new Promise<void>((resolve, reject) => {
            this._onStarted = { resolve, reject };
        });
        const worker = (this._worker = new Worker(
            path.join(__dirname, "playWorkerMain.js"),
            {
                workerData: {
                    req: this._param.req,
                    serverUrl: this._param.serverUrl,
                    serverToken: this._param.serverToken,
                } satisfies PlayWorkerData,
            },
        ));
        worker.on("message", (message: FromPlayWorker) =>
            this._onMessage(message),
        );
        worker.on("error", (err) => {
            this._abort(
                `ゲームの実行中に回復できないエラーが発生しました。(${err instanceof Error ? err.message : String(err)})`,
                err,
            );
        });
        worker.on("exit", (code) => {
            this._abort(`ゲームの実行が終了コード ${code} で終了しました。`);
        });
        this._lastBeatAt = Date.now();
        this._checkTimer = setInterval(() => this._check(), CHECK_INTERVAL_MS);
        try {
            await started;
        } catch (err) {
            await this._finish();
            throw err;
        }
    }

    async stop(): Promise<StopPlayResponse> {
        let result: ExecResult | null = null;
        if (this._state === "running") {
            this._state = "stopping";
            const stopped = new Promise<ExecResult | null>((resolve) => {
                this._onStopped = resolve;
            });
            this._post({ type: "stop" });
            let timer: NodeJS.Timeout | undefined;
            result = await Promise.race([
                stopped,
                new Promise<null>((resolve) => {
                    timer = setTimeout(() => resolve(null), STOP_TIMEOUT_MS);
                }),
            ]);
            clearTimeout(timer);
            if (!result && this._state === "stopping") {
                console.warn("play worker did not stop in time", {
                    playId: this.playId,
                });
            }
        } else if (this._state === "starting") {
            this._onStarted?.reject(new Error("play was stopped on starting"));
        }
        // 未送出の記録を送り切ってから応答する。送り切れなかったときは
        // scoreDelivered で伝え、server に古い記録で確定させない。
        const scoreDelivered = await this._finish();
        return {
            ok: true,
            crashed: this._aborted || (result?.crashed ?? false),
            errorLogged: result?.errorLogged ?? false,
            scoreDelivered,
        };
    }

    _onMessage(message: FromPlayWorker) {
        switch (message.type) {
            case "beat":
                this._lastBeatAt = Date.now();
                break;
            case "started":
                if (this._state === "starting") {
                    this._state = "running";
                    this._onStarted?.resolve();
                }
                break;
            case "startFailed":
                this._onStarted?.reject(new Error(message.message));
                break;
            case "stopped":
                this._onStopped?.(message.result);
                break;
            case "log":
                this._logSender.write(message.line);
                break;
            case "scorePlay":
                this._scoreSender?.updatePlay(message.patch);
                break;
            case "scorePlayer":
                this._scoreSender?.updatePlayer(
                    message.playerId,
                    message.patch,
                );
                break;
            case "playEnded":
                this._reportPlayEnded(message.reason, message.origin);
                break;
        }
    }

    _check() {
        const stalledMs = Date.now() - this._lastBeatAt;
        if (stalledMs >= this._param.stallTimeoutMs) {
            this._abort(
                `ゲームが ${Math.floor(stalledMs / 1000)} 秒以上応答しなかったため、実行を打ち切りました。無限ループや重すぎる処理がないか確認してください。`,
            );
        }
    }

    /** worker が止まった・落ちたときに、そのプレイだけを打ち切る */
    _abort(message: string, cause?: unknown) {
        const state = this._state;
        if (state === "idle" || state === "ended" || this._aborted) {
            return;
        }
        this._aborted = true;
        console.error(
            "play worker was aborted",
            { playId: this.playId },
            message,
            ...(cause === undefined ? [] : [cause]),
        );
        this._stopWorker();
        // WHY: 投稿者が content-log で打ち切られた理由を知れるようにする
        this._logSender.write(formatLine("error", this.playId, message) + "\n");
        if (state === "starting") {
            this._onStarted?.reject(new Error(message));
        } else if (state === "stopping") {
            this._onStopped?.(null);
        } else {
            this._reportPlayEnded("INTERNAL_ERROR", "runtime-error");
        }
    }

    _reportPlayEnded(reason: PlayEndReason, origin: PlayEndOrigin) {
        this._param.control
            .reportPlayEnded({
                playId: this.playId,
                reason,
                origin,
            })
            .catch((err) => {
                console.warn(
                    "failed to notify control of play end",
                    { playId: this.playId },
                    err,
                );
            });
    }

    _stopWorker() {
        this._state = "ended";
        if (this._checkTimer) {
            clearInterval(this._checkTimer);
            this._checkTimer = undefined;
        }
        void this._worker?.terminate();
    }

    async _finish() {
        this._stopWorker();
        let scoreDelivered = true;
        if (this._scoreSender) {
            scoreDelivered = await this._scoreSender.close();
        }
        // 未送出のログを送り切ってから応答する。ここまでのログが content-log に載る。
        await this._logSender.close();
        return scoreDelivered;
    }

    _post(message: ToPlayWorker) {
        this._worker?.postMessage(message);
    }
}
