import path from "node:path";
import { Worker } from "node:worker_threads";

export type WatchdogMessage =
    { type: "beat" } | { type: "plays"; playIds: number[] };

export interface WatchdogData {
    stallTimeoutMs: number;
}

const BEAT_INTERVAL_MS = 1000;

/**
 * メインスレッドが止まったらプロセスを強制終了させ、プラットフォームに再起動させる。
 *
 * WHY: 投稿スクリプトはプレイごとの worker で動かしているが、メインスレッドが
 * 止まるとすべてのプレイの起動・停止が応答しなくなり、プロセスは生きたまま
 * 復旧しない。止まったメインスレッドは自分では何もできないので、別スレッドから見張る。
 */
export class Watchdog {
    _worker: Worker;
    _intervalId: NodeJS.Timeout;

    constructor(stallTimeoutMs: number) {
        this._worker = new Worker(path.join(__dirname, "watchdogWorker.js"), {
            workerData: { stallTimeoutMs } satisfies WatchdogData,
        });
        this._worker.unref();
        this._intervalId = setInterval(() => {
            this._post({ type: "beat" });
        }, BEAT_INTERVAL_MS);
        this._intervalId.unref();
    }

    setPlays(playIds: number[]) {
        this._post({ type: "plays", playIds });
    }

    _post(message: WatchdogMessage) {
        this._worker.postMessage(message);
    }
}
