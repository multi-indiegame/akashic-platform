import { setTimeout as delay } from "node:timers/promises";
import type {
    ScoreboardPatch,
    ScoreboardRecords,
} from "@multi-indiegame/runner-ipc-schema";
import { warnTransport } from "./logger";

// 記録は 1 プレイの間継続して更新されるので、毎回送らず間引く。
// 落ちたときに失うのはこの間隔の分だけになる。
const DEBOUNCE_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 200;

/**
 * コンテンツが申告した記録を akashic-server へ送出する。
 *
 * 記録は runner 側でまとめてから丸ごと送る。server は受け取った内容で上書き
 * するだけでよく、届く順序を気にしなくて済む。
 */
export class ScoreSender {
    _baseUrl: string;
    _token: string;
    _playId: number;
    _records: ScoreboardRecords = {};
    _dirty = false;
    _timer?: NodeJS.Timeout;
    _pending: Promise<void> = Promise.resolve();
    _seq = 0;
    _closed = false;
    _givenUp = false;

    constructor(baseUrl: string, token: string, playId: number) {
        this._baseUrl = baseUrl;
        this._token = token;
        this._playId = playId;
    }

    updatePlay(patch: ScoreboardPatch) {
        this._records.play = merge(this._records.play, patch);
        this._touch();
    }

    updatePlayer(playerId: string, patch: ScoreboardPatch) {
        // WHY: playerId はコンテンツが決めた文字列で、`__proto__` のような名前も
        // 来うる。素のオブジェクトだと継承したプロパティに当たってしまう
        const players = (this._records.players ??= Object.create(
            null,
        ) as NonNullable<ScoreboardRecords["players"]>);
        players[playerId] = merge(players[playerId], patch);
        this._touch();
    }

    flush(): Promise<void> {
        // 古い内容で新しい内容を上書きしないよう、送信は直列化する。
        // 1 回の失敗で後続が止まらないよう、ここで必ず解消する。
        this._pending = this._pending
            .then(() => this._send())
            .catch((err) => {
                warnTransport(
                    "scoreboard の送信処理で例外が発生しました",
                    { playId: this._playId },
                    err,
                );
            });
        return this._pending;
    }

    async close(): Promise<void> {
        if (this._closed) {
            await this._pending;
            return;
        }
        this._closed = true;
        this._clearTimer();
        await this.flush();
    }

    _touch() {
        if (this._closed || this._givenUp) {
            return;
        }
        this._dirty = true;
        if (this._timer) {
            return;
        }
        this._timer = setTimeout(() => {
            this._timer = undefined;
            void this.flush();
        }, DEBOUNCE_MS);
        this._timer.unref();
    }

    _clearTimer() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = undefined;
        }
    }

    async _send() {
        if (this._givenUp || !this._dirty) {
            return;
        }
        this._dirty = false;
        // 応答が失われて再送になったとき、server が古い内容を新しい内容の後に
        // 適用しないよう通し番号を振る
        const seq = ++this._seq;
        const body = JSON.stringify({
            playId: this._playId,
            seq,
            records: this._records,
        });
        const url = `${this._baseUrl}/internal/scoreboard`;
        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const res = await fetch(url, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "x-akashic-internal-token": this._token,
                    },
                    body,
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                });
                if (res.ok) {
                    return;
                }
                if (res.status === 429) {
                    // 受け付けの上限。次のデバウンスで送り直せばよい
                    this._dirty = true;
                    return;
                }
                if (res.status < 500) {
                    // 認証誤りや play 消滅など、再送しても回復しないもの
                    this._givenUp = true;
                    warnTransport(
                        "scoreboard が受け付けられませんでした。以降の送信を打ち切ります",
                        { playId: this._playId, status: res.status },
                    );
                    return;
                }
                lastError = new Error(`status = ${res.status}`);
            } catch (err) {
                lastError = err;
            }
            if (attempt < MAX_ATTEMPTS) {
                await delay(RETRY_INTERVAL_MS * attempt);
            }
        }
        // 送れなかった内容は次回も送る対象に戻す
        this._dirty = true;
        warnTransport(
            "scoreboard の送信に失敗しました",
            { playId: this._playId },
            lastError,
        );
    }
}

/**
 * 記録の差分を取り込む。同じキーは後から来た値で上書きし、null はキーを消す。
 */
function merge(
    target: ScoreboardPatch | undefined,
    patch: ScoreboardPatch,
): ScoreboardPatch {
    const merged: ScoreboardPatch = target ?? {};
    for (const key of Object.keys(patch)) {
        const value = patch[key];
        if (value === null) {
            delete merged[key];
        } else {
            merged[key] = value;
        }
    }
    return merged;
}
