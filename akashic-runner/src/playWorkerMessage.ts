import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";
import type {
    PlayEndOrigin,
    ScoreboardPatch,
    StartPlayRequest,
} from "@multi-indiegame/runner-ipc-schema";
import type { ExecResult } from "./execRunner";

export interface PlayWorkerData {
    req: StartPlayRequest;
    serverUrl: string;
    serverToken: string;
}

/** worker からメインスレッドへ */
export type FromPlayWorker =
    | { type: "beat" }
    | { type: "started" }
    | { type: "startFailed"; message: string }
    | { type: "stopped"; result: ExecResult }
    | { type: "log"; line: string }
    | { type: "scorePlay"; patch: ScoreboardPatch }
    | { type: "scorePlayer"; playerId: string; patch: ScoreboardPatch }
    | { type: "playEnded"; reason: PlayEndReason; origin: PlayEndOrigin };

/** メインスレッドから worker へ */
export type ToPlayWorker = { type: "stop" };

export const BEAT_INTERVAL_MS = 1000;
