import { parentPort, workerData } from "node:worker_threads";
import { ControlClient } from "./controlClient";
import { ExecRunner } from "./execRunner";
import { installConsoleOverride } from "./logger";
import {
    BEAT_INTERVAL_MS,
    type FromPlayWorker,
    type PlayWorkerData,
    type ToPlayWorker,
} from "./playWorkerMessage";

installConsoleOverride();

const { req, serverUrl, serverToken } = workerData as PlayWorkerData;
const port = parentPort!;
const post = (message: FromPlayWorker) => port.postMessage(message);

setInterval(() => post({ type: "beat" }), BEAT_INTERVAL_MS);

const control = new ControlClient(serverUrl, serverToken);
const runner = new ExecRunner(req, {
    fetchAsset: (url, encoding) =>
        control.fetchAsset(req.playId, url, encoding),
    reportPlayEnded: (reason, origin) =>
        post({ type: "playEnded", reason, origin }),
    logSink: { write: (line) => post({ type: "log", line }) },
    scoreSink: req.scoreboard
        ? {
              updatePlay: (patch) => post({ type: "scorePlay", patch }),
              updatePlayer: (playerId, patch) =>
                  post({ type: "scorePlayer", playerId, patch }),
          }
        : undefined,
});

port.on("message", (message: ToPlayWorker) => {
    if (message.type === "stop") {
        void runner.stop().then((result) => post({ type: "stopped", result }));
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
