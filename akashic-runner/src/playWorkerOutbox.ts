import { isValidRecordKey } from "@multi-indiegame/akashic-scoreboard-plugin";
import type { ScoreboardPatch } from "@multi-indiegame/runner-ipc-schema";
import type { FromPlayWorker } from "./playWorkerMessage";

export const OUTBOX_FLUSH_INTERVAL_MS = 200;
const MAX_PENDING_LOG_BYTES = 1024 * 1024;

/**
 * worker からメインスレッドへ送るログと記録をまとめて送る。
 *
 * WHY: postMessage には送り手を待たせる仕組みがない。ログや記録をループで出し続ける
 * ゲームが 1 件ずつ送ると、打ち切るまでの間にメインスレッドの受信キューが際限なく
 * 膨らみ、ほかのプレイを巻き込んでプロセスのメモリを使い果たす。worker 側で量を
 * 抑え、送る回数も間隔ごとに 1 回にする。
 */
export class PlayWorkerOutbox {
    _post: (message: FromPlayWorker) => void;
    _lines: string[] = [];
    _bytes = 0;
    _dropped = 0;
    _play?: ScoreboardPatch;
    _players = new Map<string, ScoreboardPatch>();

    constructor(post: (message: FromPlayWorker) => void) {
        this._post = post;
    }

    writeLog(line: string) {
        const size = Buffer.byteLength(line);
        if (this._bytes + size > MAX_PENDING_LOG_BYTES) {
            this._dropped++;
            return;
        }
        this._lines.push(line);
        this._bytes += size;
    }

    updatePlay(patch: ScoreboardPatch) {
        this._play = assign(this._play, patch);
    }

    updatePlayer(playerId: string, patch: ScoreboardPatch) {
        this._players.set(playerId, assign(this._players.get(playerId), patch));
    }

    flush() {
        if (this._lines.length > 0 || this._dropped > 0) {
            this._post({
                type: "log",
                lines: this._lines,
                dropped: this._dropped,
            });
            this._lines = [];
            this._bytes = 0;
            this._dropped = 0;
        }
        if (this._play || this._players.size > 0) {
            this._post({
                type: "score",
                play: this._play,
                players: [...this._players],
            });
            this._play = undefined;
            this._players.clear();
        }
    }
}

/**
 * 差分どうしを重ねる。null もキーの削除として送り先へ届ける必要があるので、
 * 記録への適用と違ってキーを消さずに上書きする。
 */
function assign(
    target: ScoreboardPatch | undefined,
    patch: ScoreboardPatch,
): ScoreboardPatch {
    const merged: ScoreboardPatch = target ?? Object.create(null);
    for (const key of Object.keys(patch)) {
        if (isValidRecordKey(key)) {
            merged[key] = patch[key];
        }
    }
    return merged;
}
