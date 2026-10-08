import { setTimeout as delay } from "node:timers/promises";
import { warnTransport } from "./logger";

const FLUSH_INTERVAL_MS = 1000;
const FLUSH_THRESHOLD_BYTES = 64 * 1024;
// 送信できない状況が続いたときに akashic-runner のメモリを食い潰さないための上限。
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const RETRY_INTERVAL_MS = 200;

/**
 * content-log を akashic-server へ送出する。
 *
 * 1 プレイ 1 本の長命リクエストでストリームすると、 Node HTTP サーバーの既定
 * タイムアウト (headersTimeout = 60 秒 / requestTimeout = 300 秒) や経路上の
 * アイドル切断で黙って接続を切られ、以降のログがすべて失われる。そのため
 * 短命な POST を都度張り直すバッチ送信としている。
 */
export class LogSender {
    _baseUrl: string;
    _token: string;
    _playId: number;
    _buffer: string[] = [];
    _bufferedBytes = 0;
    _droppedLines = 0;
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

    write(line: string) {
        if (this._closed || this._givenUp) {
            return;
        }
        const size = Buffer.byteLength(line);
        if (this._bufferedBytes + size > MAX_BUFFERED_BYTES) {
            this._droppedLines++;
            return;
        }
        this._buffer.push(line);
        this._bufferedBytes += size;
        if (this._bufferedBytes >= FLUSH_THRESHOLD_BYTES) {
            void this.flush();
            return;
        }
        if (!this._timer) {
            this._timer = setTimeout(() => {
                this._timer = undefined;
                void this.flush();
            }, FLUSH_INTERVAL_MS);
            this._timer.unref();
        }
    }

    flush(final = false): Promise<void> {
        // 行の順序が入れ替わらないよう、送信は直列化する。
        // 1 回の失敗で後続の送信が止まらないよう、ここで必ず解消する。
        this._pending = this._pending
            .then(() => this._send(final))
            .catch((err) => {
                warnTransport(
                    "content-log の送信処理で例外が発生しました",
                    {
                        playId: this._playId,
                    },
                    err,
                );
            });
        return this._pending;
    }

    /** 送り手の側で破棄した行数を、content-log に残す */
    addDropped(count: number) {
        if (this._closed || this._givenUp) {
            return;
        }
        this._droppedLines += count;
    }

    async close(): Promise<void> {
        if (this._closed) {
            await this._pending;
            return;
        }
        this._closed = true;
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = undefined;
        }
        // final=1 で akashic-server 側に「全ログ送出済み」を伝え、 S3 確定を待たせない。
        await this.flush(true);
    }

    _takeBuffer(): string {
        const lines = this._buffer;
        const dropped = this._droppedLines;
        this._buffer = [];
        this._bufferedBytes = 0;
        this._droppedLines = 0;
        let body = lines.join("");
        if (dropped > 0) {
            body +=
                JSON.stringify({
                    timestamp: new Date().toISOString(),
                    level: "warn",
                    playId: this._playId,
                    message: `content-log のバッファ上限を超えたため ${dropped} 行を破棄しました。`,
                }) + "\n";
        }
        return body;
    }

    async _send(final: boolean) {
        if (this._givenUp) {
            return;
        }
        const body = this._takeBuffer();
        if (!body && !final) {
            return;
        }
        // 応答が失われたときの再送で content-log に同じ行が二重に載らないよう、
        // バッチに通し番号を振る。リトライは同じ番号のまま送り直す。
        const seq = ++this._seq;
        const url = `${this._baseUrl}/internal/logs?playId=${this._playId}&seq=${seq}${
            final ? "&final=1" : ""
        }`;
        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const res = await fetch(url, {
                    method: "POST",
                    headers: {
                        "content-type": "application/x-ndjson",
                        "x-akashic-internal-token": this._token,
                    },
                    body,
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                });
                if (res.ok) {
                    return;
                }
                if (res.status < 500) {
                    // 認証誤りや play 消滅など、再送しても回復しないもの。
                    this._givenUp = true;
                    warnTransport(
                        "content-log が受け付けられませんでした。以降の送信を打ち切ります",
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
        warnTransport(
            "content-log の送信に失敗しました",
            { playId: this._playId, bytes: Buffer.byteLength(body) },
            lastError,
        );
    }
}
