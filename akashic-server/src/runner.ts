import type { PassThrough } from "node:stream";
import type { Upload } from "@aws-sdk/lib-storage";
import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";
import { prisma } from "@multi-indiegame/persist-schema";
import type { ScoreboardRecords } from "@multi-indiegame/runner-ipc-schema";
import { reconcilePlay } from "@multi-indiegame/scoreboard-schema";
import type { RunnerClient } from "./runnerClient";
import { finalizeScoreRecords } from "./scoreboard";
import { playStorage } from "./logger";
import { withPlayBaggage } from "./playBaggage";
import { maskSecrets } from "./secretMasker";
import { createContentLogUpload } from "./s3Logger";

const PLAY_DURATION_MS = 30 * 60 * 1000;
const EXTEND_WINDOW_MS = 10 * 60 * 1000;
const EXTEND_MS = 30 * 60 * 1000;
// 参加者(ブラウザ接続)が 0 人のまま継続したら部屋を自動終了する猶予時間。
// リロードや一時的な回線切れに耐えるため余裕をもたせている。
const IDLE_GRACE_MS = 5 * 60 * 1000;
// 参加者数をポーリングする間隔。猶予よりも十分短くする。
const IDLE_POLL_INTERVAL_MS = 30 * 1000;
// content-log は S3 へ確定するまでメモリ上の PassThrough に溜まるため、投稿スクリプトが
// 大量出力してもメモリと S3 オブジェクトが際限なく膨らまないよう上限を設ける。
const MAX_CONTENT_LOG_BYTES = 16 * 1024 * 1024;

export interface RunnerParameterObject {
    publicWebappUrl: string;
    storagePublicUrl: string;
    storageAdminUrl: string;
    storageAdminToken: string;
    maxPreservingTickSize: number;
    runnerClient: RunnerClient;
    playName: string;
    contentId: number;
    contentUrl: string;
    assetBaseUrl: string;
    configurationUrl: string;
    /** ゲームに申告する in-game playerId（ゲストは guest_id を秘匿した派生値）。Join で配布される */
    playerId: string;
    /** Play.gameMasterId として永続する部屋主の生 id（webapp の identity 判定用） */
    gameMasterId: string;
    playerUserId?: string;
    playerName: string;
    isLimited: boolean;
    joinWord?: string;
    inviteHash?: string;
    requireSignIn: boolean;
    chatEnabled: boolean;
    /** コンテンツが scoreboard を宣言しているか。生やすかどうかを決める */
    scoreboard: boolean;
    onDestroy: (playId: number) => void;
}

export class Runner {
    _param: RunnerParameterObject;
    _playId?: number;
    _expiresAt?: number;
    _timeoutId?: NodeJS.Timeout;
    _idleIntervalId?: NodeJS.Timeout;
    _emptySince?: number;
    _ending = false;
    _logStream?: PassThrough;
    _upload?: Upload;
    _logDrainedPromise?: Promise<void>;
    _resolveLogDrained?: () => void;
    _lastLogSeq = 0;
    _logBytes = 0;
    _logTruncated = false;
    _startedAt?: number;
    _scoreRecords?: ScoreboardRecords;
    _lastScoreSeq = 0;
    _scoreClosed = false;

    constructor(param: RunnerParameterObject) {
        this._param = param;
    }

    markLogDrained() {
        if (this._resolveLogDrained) {
            this._resolveLogDrained();
        }
    }

    async createPlay() {
        if (this._playId != null) {
            throw new Error(`runner (playId = "${this._playId}") has started.`);
        }
        const playId = await this._createPlayId();
        this._playId = playId;

        const { logStream, upload } = createContentLogUpload(
            this._param.contentId,
            playId,
        );
        this._logStream = logStream;
        this._upload = upload;
        this._logDrainedPromise = new Promise<void>((resolve) => {
            this._resolveLogDrained = resolve;
        });
        return playId;
    }

    async run() {
        const playId = this._playId;
        if (playId == null) {
            throw new Error("createPlay() must be called before run()");
        }
        await playStorage.run(
            { playId, contentId: this._param.contentId },
            () =>
                withPlayBaggage(playId, this._param.contentId, async () => {
                    let storageStarted = false;
                    try {
                        // この呼び出しで storage 側にプレイができる
                        const playToken = await this._fetchPlayToken(playId);
                        storageStarted = true;
                        await this._param.runnerClient.startPlay({
                            playId,
                            storagePublicUrl: this._param.storagePublicUrl,
                            playToken,
                            contentUrl: this._param.contentUrl,
                            assetBaseUrl: this._param.assetBaseUrl,
                            configurationUrl: this._param.configurationUrl,
                            playerId: this._param.playerId,
                            playerName: this._param.playerName,
                            maxPreservingTickSize:
                                this._param.maxPreservingTickSize,
                            scoreboard: this._param.scoreboard ? {} : undefined,
                        });
                        this._startedAt = Date.now();
                        this._setTimer(Date.now() + PLAY_DURATION_MS);
                        this._startIdleWatch(playId);
                    } catch (err) {
                        this._clearTimer();
                        this._clearIdleWatch();
                        if (storageStarted) {
                            await this._endPlay(playId, "INTERNAL_ERROR").catch(
                                (e) =>
                                    console.warn(
                                        `failed to end storage play on start failure (playId = "${playId}")`,
                                        e,
                                    ),
                            );
                        }
                        this._logStream?.destroy();
                        this._upload?.abort().catch((err) => {
                            console.warn(
                                `upload was aborted in initialization`,
                                err,
                            );
                        });
                        this._logStream = undefined;
                        this._upload = undefined;
                        this._playId = undefined;
                        this._deletePlayId(playId);
                        throw err;
                    }
                }),
        );
    }

    acceptsLog() {
        return this._logStream != null && !this._logStream.writableEnded;
    }

    appendLog(body: string, seq?: number) {
        // 応答が失われた際 akashic-runner は同じバッチを再送するため、
        // 適用済みの通し番号は捨てて content-log の重複を防ぐ。
        if (seq != null) {
            if (seq <= this._lastLogSeq) {
                return;
            }
            this._lastLogSeq = seq;
        }
        if (!this.acceptsLog() || this._logTruncated) {
            return;
        }
        const masked = maskSecrets(body);
        const size = Buffer.byteLength(masked);
        if (this._logBytes + size > MAX_CONTENT_LOG_BYTES) {
            this._logTruncated = true;
            this._logStream!.write(
                JSON.stringify({
                    timestamp: new Date().toISOString(),
                    level: "warn",
                    playId: this._playId,
                    message: `content-log が上限 (${MAX_CONTENT_LOG_BYTES} バイト) に達したため、以降のログを打ち切りました。`,
                }) + "\n",
            );
            return;
        }
        this._logBytes += size;
        this._logStream!.write(masked);
    }

    acceptsScore() {
        // WHY: 終了処理に入っても stopPlay が済むまでは受け付ける。runner は
        // 停止の中で、間引き待ちだった最後の記録を送ってくる
        return this._playId != null && !this._scoreClosed;
    }

    /**
     * 進行中の記録を受け取る。
     *
     * WHY: メモリにだけ持つ。1 プレイに閉じた情報の欠落は許容する範囲なので、
     * 更新のたびに DB を叩く必要がない。
     */
    updateScore(records: ScoreboardRecords, seq: number) {
        // 応答が失われて再送になったとき、古い内容で新しい内容を上書きしない
        if (seq <= this._lastScoreSeq) {
            return;
        }
        this._lastScoreSeq = seq;
        this._scoreRecords = records;
    }

    resolveAllowedAsset(url: string) {
        let target: URL;
        try {
            target = new URL(url);
        } catch {
            return null;
        }
        // configurationUrl は単一ファイル(game.json)。パス完全一致のみ許可。
        if (this._matchesFile(target, this._param.configurationUrl)) {
            return target.href;
        }
        // assetBaseUrl はディレクトリ。その配下のみ許可。
        if (this._isUnderDir(target, this._param.assetBaseUrl)) {
            return target.href;
        }
        return null;
    }

    _matchesFile(target: URL, fileUrl: string) {
        let base: URL;
        try {
            base = new URL(fileUrl);
        } catch {
            return false;
        }
        return (
            target.origin === base.origin && target.pathname === base.pathname
        );
    }

    _isUnderDir(target: URL, dirUrl: string) {
        let base: URL;
        try {
            base = new URL(dirUrl);
        } catch {
            return false;
        }
        if (target.origin !== base.origin) {
            return false;
        }
        const basePath = base.pathname.endsWith("/")
            ? base.pathname
            : `${base.pathname}/`;
        return target.pathname.startsWith(basePath);
    }

    async end(
        reason: PlayEndReason,
        notifyPlaylogServer = true,
    ): Promise<void> {
        if (this._playId == null || this._ending) {
            return;
        }
        if (playStorage.getStore() == null) {
            const playId = this._playId;
            return playStorage.run(
                { playId, contentId: this._param.contentId },
                () =>
                    withPlayBaggage(playId, this._param.contentId, () =>
                        this.end(reason, notifyPlaylogServer),
                    ),
            );
        }
        this._ending = true;
        const playId = this._playId;
        this._clearTimer();
        this._clearIdleWatch();

        let crashed = false;
        let errorLogged = false;
        try {
            const res = await this._param.runnerClient.stopPlay(playId);
            crashed = res.crashed;
            errorLogged = res.errorLogged;
        } catch (err) {
            console.warn(
                `failed to stop play on runner (playId = "${playId}")`,
                err,
            );
        }
        this._scoreClosed = true;

        if (notifyPlaylogServer) {
            try {
                await this._endPlay(playId, reason);
            } catch (err) {
                console.warn(`failed to end play (playId = "${playId}")`, err);
            }
        }
        await this._finalizeScore(playId, crashed);
        await this._endPlayRecord(playId);
        this._param.onDestroy(playId);

        if (this._logStream && this._upload) {
            this._runBackgroundUpload(
                playId,
                this._logStream,
                this._upload,
                crashed,
                errorLogged,
            ).catch((err) => {
                console.warn(
                    `background upload failed (playId = "${playId}")`,
                    err,
                );
            });
        }

        this._playId = undefined;
        this._logStream = undefined;
        this._upload = undefined;
    }

    getRemaining() {
        if (this._expiresAt == null) {
            return undefined;
        }
        return {
            remainingMs: Math.max(this._expiresAt - Date.now(), 0),
            expiresAt: this._expiresAt,
        };
    }

    async extend(): Promise<
        | { ok: false; reason: "NotFound" }
        | {
              ok: false;
              reason: "TooEarly";
              remainingMs: number;
              expiresAt: number;
          }
        | { ok: true; expiresAt: number; remainingMs: number; extendMs: number }
    > {
        if (this._playId != null && playStorage.getStore() == null) {
            return playStorage.run(
                { playId: this._playId, contentId: this._param.contentId },
                () =>
                    withPlayBaggage(this._playId!, this._param.contentId, () =>
                        this.extend(),
                    ),
            );
        }
        if (this._expiresAt == null || this._playId == null) {
            return { ok: false, reason: "NotFound" } as const;
        }
        const remainingMs = this._expiresAt - Date.now();
        if (remainingMs > EXTEND_WINDOW_MS) {
            return {
                ok: false,
                reason: "TooEarly",
                remainingMs,
                expiresAt: this._expiresAt,
            } as const;
        }
        this._expiresAt += EXTEND_MS;
        this._setTimer(this._expiresAt);
        const payload = {
            expiresAt: this._expiresAt,
            remainingMs: Math.max(this._expiresAt - Date.now(), 0),
            extendMs: EXTEND_MS,
        };
        await this._notifyExtend(this._playId, payload);
        return { ok: true, ...payload } as const;
    }

    async _createPlayId() {
        return (
            await prisma.play.create({
                data: {
                    contentId: this._param.contentId,
                    gameMasterId: this._param.gameMasterId,
                    gmUserId: this._param.playerUserId,
                    name: this._param.playName,
                    isLimited: this._param.isLimited,
                    joinWord: this._param.joinWord,
                    inviteHash: this._param.inviteHash,
                    requireSignIn: this._param.requireSignIn,
                    chatEnabled: this._param.chatEnabled,
                },
            })
        ).id;
    }

    async _deletePlayId(playId: number) {
        try {
            await prisma.play.delete({
                where: {
                    id: playId,
                },
            });
        } catch (err) {
            console.warn(`failed to delete playId "${playId}"`, err);
        }
    }

    async _finalizeScore(playId: number, crashed: boolean) {
        if (!this._scoreRecords) {
            return;
        }
        const records = this._scoreRecords;
        this._scoreRecords = undefined;
        try {
            await finalizeScoreRecords({
                playId,
                contentId: this._param.contentId,
                records,
                startedAt: this._startedAt ?? Date.now(),
                crashed,
            });
            // WHY: 掲載してよいかの判定はこの呼び出しの中だけで行う。
            // ここは「揃ったので突き合わせてほしい」と伝えるだけで、
            // 同意そのものは扱わない
            await reconcilePlay(playId);
        } catch (err) {
            // WHY: 記録が残らないことの影響はそのプレイに閉じるので、
            // プレイの終了処理は止めない（ログのアップロードと同じ扱い）
            console.warn(
                `failed to finalize score records (playId = "${playId}")`,
                err,
            );
        }
    }

    async _endPlayRecord(playId: number) {
        try {
            await prisma.play.update({
                where: { id: playId },
                data: {
                    isActive: false,
                    endedAt: new Date(),
                },
            });
        } catch (err) {
            console.warn(
                `failed to end play record (playId = "${playId}")`,
                err,
            );
        }
        try {
            await prisma.playChatMessage.deleteMany({ where: { playId } });
        } catch (err) {
            console.warn(
                `failed to delete play chat messages (playId = "${playId}")`,
                err,
            );
        }
        try {
            // 発行済み playToken の記録は部屋終了で不要になる
            await prisma.playSession.deleteMany({ where: { playId } });
        } catch (err) {
            console.warn(
                `failed to delete play sessions (playId = "${playId}")`,
                err,
            );
        }
        try {
            // ゲスト部屋主の部屋単位 BAN は部屋終了で意味を失う
            await prisma.ban.deleteMany({ where: { playId } });
        } catch (err) {
            console.warn(
                `failed to delete room-scoped bans (playId = "${playId}")`,
                err,
            );
        }
    }

    async _runBackgroundUpload(
        playId: number,
        logStream: PassThrough,
        upload: Upload,
        crashed: boolean,
        errorLogged: boolean,
    ): Promise<void> {
        // ログ受信完了を待ってから S3 確定。届かない場合はタイムアウト
        if (this._logDrainedPromise) {
            await Promise.race([
                this._logDrainedPromise,
                new Promise<void>((resolve) => setTimeout(resolve, 5000)),
            ]);
        }
        if (!logStream.writableEnded) {
            logStream.end();
        }

        let uploadSucceeded = false;
        try {
            await upload.done();
            uploadSucceeded = true;
        } catch (err) {
            console.warn(
                `failed to upload play log (playId = "${playId}")`,
                err,
            );
        }

        try {
            await prisma.play.update({
                where: { id: playId },
                data: {
                    crashed,
                    errorLogged,
                    ...(uploadSucceeded ? { logUploadedAt: new Date() } : {}),
                },
            });
        } catch (err) {
            console.warn(
                `failed to update play log status (playId = "${playId}")`,
                err,
            );
            return;
        }

        if (!uploadSucceeded) {
            return;
        }

        if (crashed) {
            await this._createGameCrashedNortification(playId).catch((err) => {
                console.warn(
                    `failed to create GAME_CRASHED notification (playId = "${playId}")`,
                    err,
                );
            });
        }
        if (errorLogged) {
            await this._createGameErrorLoggedNortification(playId).catch(
                (err) => {
                    console.warn(
                        `failed to create GAME_ERROR_LOGGED notification (playId = "${playId}")`,
                        err,
                    );
                },
            );
        }

        try {
            const clientLogCount = (
                await prisma.clientLogRecord.groupBy({
                    by: ["clientId"],
                    where: { playId },
                })
            ).length;
            if (clientLogCount > 0) {
                await this._createClientLogSubmittedNotification(
                    playId,
                    clientLogCount,
                );
            }
        } catch (err) {
            console.warn(
                `failed to create CLIENT_LOG_SUBMITTED notification (playId = "${playId}")`,
                err,
            );
        }
    }

    async _fetchPlayToken(playId: number) {
        const res = await fetch(
            `${this._param.storageAdminUrl}/start?playId=${playId}`,
            {
                headers: {
                    "x-akashic-internal-token": this._param.storageAdminToken,
                },
            },
        );
        if (res.status !== 200) {
            throw new Error(
                `failed to start because of storage-server error. (cause = "${await res.text()}")`,
            );
        }
        const { playToken } = (await res.json()) as { playToken: string };
        return playToken;
    }

    async _endPlay(playId: number, reason: PlayEndReason) {
        const res = await fetch(
            `${this._param.storageAdminUrl}/end?playId=${playId}&reason=${reason}`,
            {
                headers: {
                    "x-akashic-internal-token": this._param.storageAdminToken,
                },
            },
        );
        if (res.status !== 200) {
            console.warn(
                `failed to end because of storage-server error. (cause = "${await res.text()}")`,
            );
        }
    }

    _setTimer(expiresAt: number) {
        this._clearTimer();
        this._expiresAt = expiresAt;
        const delay = Math.max(expiresAt - Date.now(), 0);
        this._timeoutId = setTimeout(async () => {
            await this.end("TIMEOUT");
        }, delay);
    }

    _clearTimer() {
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            this._timeoutId = undefined;
        }
        this._expiresAt = undefined;
    }

    // 参加者(ブラウザ接続)が 0 人のまま IDLE_GRACE_MS を超えて続いたら部屋を自動終了する。
    // 終了は正規パスである this.end() に合流させ、DB 更新・akashic-runner停止・ログ upload を行う。
    // 作成直後に部屋主のブラウザが接続するまでの数秒の 0 人は、5 分の猶予が十分に吸収する。
    _startIdleWatch(playId: number) {
        this._clearIdleWatch();
        this._emptySince = undefined;
        this._idleIntervalId = setInterval(async () => {
            let participants: number;
            try {
                const res = await fetch(
                    `${this._param.storagePublicUrl}/participants?playId=${playId}`,
                );
                if (res.status !== 200) {
                    throw new Error(await res.text());
                }
                participants = ((await res.json()) as { participants: number })
                    .participants;
            } catch (err) {
                // 取得に失敗したら参加者数不明として保守的に何もしない(閉じない)。
                console.warn(
                    `failed to get participants for idle watch (playId = "${playId}")`,
                    err,
                );
                return;
            }
            if (participants > 0) {
                this._emptySince = undefined;
                return;
            }
            if (this._emptySince == null) {
                this._emptySince = Date.now();
                return;
            }
            if (Date.now() - this._emptySince >= IDLE_GRACE_MS) {
                console.log(
                    `idle watch triggers auto close (playId = "${playId}")`,
                );
                await this.end("IDLE");
            }
        }, IDLE_POLL_INTERVAL_MS);
    }

    _clearIdleWatch() {
        if (this._idleIntervalId) {
            clearInterval(this._idleIntervalId);
            this._idleIntervalId = undefined;
        }
        this._emptySince = undefined;
    }

    async _createClientLogSubmittedNotification(
        playId: number,
        count: number,
    ): Promise<void> {
        const content = await prisma.content.findUniqueOrThrow({
            where: { id: this._param.contentId },
            select: {
                game: {
                    select: { id: true, title: true, publisherId: true },
                },
            },
        });
        await prisma.notification.create({
            data: {
                userId: content.game.publisherId,
                unread: true,
                type: "CLIENT_LOG_SUBMITTED",
                body: `「${content.game.title}」について、プレイヤーから不具合の詳細情報が ${count} 件報告されました。`,
                iconURL: `${this._param.publicWebappUrl}/api/game/${content.game.id}/icon`,
                link: `/game/${content.game.id}/logs#play-${playId}`,
            },
        });
    }

    async _createGameCrashedNortification(playId: number): Promise<void> {
        const content = await prisma.content.findUniqueOrThrow({
            where: { id: this._param.contentId },
            select: {
                game: {
                    select: { id: true, title: true, publisherId: true },
                },
            },
        });
        await prisma.notification.create({
            data: {
                userId: content.game.publisherId,
                unread: true,
                type: "GAME_CRASHED",
                body: `「${content.game.title}」がエラーで異常終了しました。`,
                iconURL: `${this._param.publicWebappUrl}/api/game/${content.game.id}/icon`,
                link: `/game/${content.game.id}/logs#play-${playId}`,
            },
        });
    }

    async _createGameErrorLoggedNortification(playId: number): Promise<void> {
        const content = await prisma.content.findUniqueOrThrow({
            where: { id: this._param.contentId },
            select: {
                game: {
                    select: { id: true, title: true, publisherId: true },
                },
            },
        });
        await prisma.notification.create({
            data: {
                userId: content.game.publisherId,
                unread: true,
                type: "GAME_ERROR_LOGGED",
                body: `「${content.game.title}」の実行中にエラーログが出力されました。`,
                iconURL: `${this._param.publicWebappUrl}/api/game/${content.game.id}/icon`,
                link: `/game/${content.game.id}/logs#play-${playId}`,
            },
        });
    }

    async _notifyExtend(
        playId: number,
        payload: { expiresAt: number; remainingMs: number; extendMs: number },
    ) {
        const res = await fetch(`${this._param.storagePublicUrl}/extend`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                playId: playId.toString(),
                ...payload,
            }),
        });
        if (res.status !== 200) {
            console.warn(
                `failed to notify extend. (playId = "${playId}", cause = "${await res.text()}")`,
            );
        }
    }
}
