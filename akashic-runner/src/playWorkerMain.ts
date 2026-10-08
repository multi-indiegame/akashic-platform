import { parentPort, workerData } from "node:worker_threads";
import { ControlClient } from "./controlClient";
import { ExecRunner } from "./execRunner";
import { installConsoleOverride } from "./logger";
import { OUTBOX_FLUSH_INTERVAL_MS, PlayWorkerOutbox } from "./playWorkerOutbox";
import {
    BEAT_INTERVAL_MS,
    type FromPlayWorker,
    type PlayWorkerData,
    type ToPlayWorker,
} from "./playWorkerMessage";

// WHY: worker の標準出力はメインスレッドを経由して際限なく溜まる。プレイのログは
// メインスレッドが受け取った分だけを出力する
installConsoleOverride({ echo: false });

const { req, serverUrl, serverToken } = workerData as PlayWorkerData;
const port = parentPort!;
const post = (message: FromPlayWorker) => port.postMessage(message);

const outbox = new PlayWorkerOutbox(post);

setInterval(() => post({ type: "beat" }), BEAT_INTERVAL_MS);
setInterval(() => outbox.flush(), OUTBOX_FLUSH_INTERVAL_MS);

const control = new ControlClient(serverUrl, serverToken);
const runner = new ExecRunner(req, {
    fetchAsset: (url, encoding) =>
        control.fetchAsset(req.playId, url, encoding),
    reportPlayEnded: (reason, origin) =>
        post({ type: "playEnded", reason, origin }),
    logSink: { write: (line) => outbox.writeLog(line) },
    scoreSink: req.scoreboard ? outbox : undefined,
});

port.on("message", (message: ToPlayWorker) => {
    if (message.type === "stop") {
        void runner.stop().then((result) => {
            outbox.flush();
            post({ type: "stopped", result });
        });
    }
});

runner.start().then(
    () => post({ type: "started" }),
    (err) =>
        post({
            type: "startFailed",
            message: err instanceof Error ? err.message : String(err),
        }),
);
