import fs from "node:fs";
import process from "node:process";
import { parentPort, workerData } from "node:worker_threads";
import { formatLine } from "./logger";
import type { WatchdogData, WatchdogMessage } from "./watchdog";

const CHECK_INTERVAL_MS = 5000;

const { stallTimeoutMs } = workerData as WatchdogData;
let lastBeatAt = Date.now();
let playIds: number[] = [];

parentPort!.on("message", (message: WatchdogMessage) => {
    if (message.type === "beat") {
        lastBeatAt = Date.now();
    } else {
        playIds = message.playIds;
    }
});

setInterval(() => {
    const stalledMs = Date.now() - lastBeatAt;
    if (stalledMs < stallTimeoutMs) {
        return;
    }
    // WHY: worker の console はメインスレッド経由で出力されるため、止まっている間は
    // 出てこない。標準エラー出力へ直接書く
    fs.writeSync(
        2,
        formatLine(
            "error",
            undefined,
            `main thread has been stalled for ${stalledMs}ms. akashic-runner is killed forcibly. (running playIds = ${JSON.stringify(playIds)})`,
        ) + "\n",
    );
    // WHY: 終了処理はメインスレッドでしか動かないので、待たずに落とす
    process.kill(process.pid, "SIGKILL");
}, CHECK_INTERVAL_MS);
