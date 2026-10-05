import type { AMFlow } from "@akashic/amflow";
import { EventCode, JoinEvent, MessageEvent } from "@akashic/playlog";
import { RunnerV3 } from "@akashic/headless-driver";
import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";
import type {
    PlayEndOrigin,
    ScoreboardLimits as IpcScoreboardLimits,
    ScoreboardPatch,
    StartPlayRequest,
} from "@multi-indiegame/runner-ipc-schema";
import {
    AMFlowClient,
    Session,
    SessionLike,
} from "@multi-indiegame/playlog-client";
import { ScoreboardPlugin } from "@multi-indiegame/akashic-scoreboard-plugin";
import type { ScoreboardLimits as PluginScoreboardLimits } from "@multi-indiegame/akashic-scoreboard-plugin";
import { type LogSink, playStorage } from "./logger";

/**
 * IPC で受け取った上限を、そのまま拡張ライブラリへ渡してよいか検める。
 *
 * WHY: IPC の型はプロセス間で交わす JSON の取り決めで、拡張ライブラリの型とは
 * 別に定めている（akashic-server にコンテンツ側の拡張を依存させないため）。
 * だが上限だけは、受け取った値をそのままプラグインへ渡している。項目名が
 * 食い違っても構造的型付けでは通ってしまい、**上限がエラーなしに効かなくなる**。
 * 双方向の代入で確かめ、ずれたらここでビルドを落とす。
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _scoreboardLimitsMatchPlugin: Exact<
    Required<IpcScoreboardLimits>,
    Required<PluginScoreboardLimits>
> = true;
void _scoreboardLimitsMatchPlugin;

// `akashic-gameview` の ProtocolType と同じ。
const ProtocolType = {
    WebSocket: 0,
} as const;

const SESSION_OPEN_TIMEOUT_MS = 15000;

export interface ScoreSink {
    updatePlay(patch: ScoreboardPatch): void;
    updatePlayer(playerId: string, patch: ScoreboardPatch): void;
}

/** ExecRunner がプレイの外へ出すものの送り先 */
export interface ExecHost {
    fetchAsset(
        url: string,
        encoding: "utf-8" | "uint8array",
    ): Promise<string | Uint8Array>;
    reportPlayEnded(reason: PlayEndReason, origin: PlayEndOrigin): void;
    logSink: LogSink;
    /** 記録を受け取るときだけ指定する */
    scoreSink?: ScoreSink;
}

export interface ExecResult {
    crashed: boolean;
    errorLogged: boolean;
}

export class ExecRunner {
    _param: StartPlayRequest;
    _host: ExecHost;
    _runner?: RunnerV3;
    _session?: SessionLike;
    _onPlayEndBound: (reason: PlayEndReason) => void;
    _crashing = false;
    _errorLogged = false;
    _reported = false;

    constructor(param: StartPlayRequest, host: ExecHost) {
        this._param = param;
        this._host = host;
        this._onPlayEndBound = this._onPlayEnd.bind(this);
    }

    async start() {
        const playId = this._param.playId;
        await playStorage.run(
            { playId, logSink: this._host.logSink },
            async () => {
                const ctx = playStorage.getStore();
                if (ctx) {
                    ctx.onError = () => {
                        if (this._crashing || this._errorLogged) return;
                        this._errorLogged = true;
                    };
                }
                this._session = this._openSession(
                    playId,
                    this._param.playToken,
                );
                const amflow = await this._createAMFlow(this._session);
                this._subscribePlayEnd(amflow);
                this._runner = await this._createRunner(playId, amflow);
                this._initGame(amflow);
            },
        );
    }

    async stop(): Promise<ExecResult> {
        if (this._runner) {
            this._unsubscribePlayEnd(this._runner);
            this._runner.stop();
            this._runner = undefined;
        }
        if (this._session) {
            await this._closeSession(this._session);
            this._session = undefined;
        }
        return {
            crashed: this._crashing,
            errorLogged: this._errorLogged,
        };
    }

    /**
     * アクティブインスタンスの `g.game.external` に入れる値を作る。
     *
     * WHY: 拡張ライブラリ側も `g.game.isActiveInstance()` で報告元を絞るので
     * 二重だが、宣言していないコンテンツに生やさなければ、そもそも無駄な
     * 処理も通信も起きない。
     */
    _createExternalValue() {
        const scoreSink = this._host.scoreSink;
        if (!scoreSink) {
            return {};
        }
        const plugin = new ScoreboardPlugin({
            limits: this._param.scoreboard?.limits,
            backend: {
                record: (subject, patch, rejected) => {
                    if (rejected.length > 0) {
                        // WHY: 黙って消すと、投稿者が「値は送っているのに
                        // 記録されない」で行き詰まる。調査の手がかりを残す
                        for (const entry of rejected) {
                            console.warn("scoreboard の値を破棄しました", {
                                playId: this._param.playId,
                                key: entry.key,
                                reason: entry.reason,
                            });
                        }
                    }
                    if (subject.kind === "play") {
                        scoreSink.updatePlay(patch);
                    } else {
                        scoreSink.updatePlayer(subject.playerId, patch);
                    }
                },
            },
        });
        return { scoreboard: plugin.createExternal() };
    }

    _openSession(playId: number, playToken: string) {
        const session = (this._session = Session(
            `${this._param.storagePublicUrl}/socket.io`,
            {
                socketType: ProtocolType.WebSocket,
                validationData: {
                    playId: playId.toString(),
                    token: playToken,
                },
            },
        ));
        session.on("error", (err) => {
            console.error("error on session", err);
        });
        return session;
    }

    async _closeSession(session: SessionLike) {
        await new Promise<void>((resolve) => {
            session.close((msg) => {
                if (msg) {
                    console.log(
                        `session of playId = "${this._param.playId}" was ended.`,
                        msg,
                    );
                }
                resolve();
            });
        });
    }

    async _createAMFlow(session: SessionLike) {
        return await new Promise<AMFlowClient>((resolve, reject) => {
            // WHY: storage へつながらない間、socket.io は再接続を繰り返すだけで
            // open の失敗を返さない
            const timer = setTimeout(() => {
                reject(
                    new Error(
                        `failed to connect to storage within ${SESSION_OPEN_TIMEOUT_MS}ms`,
                    ),
                );
            }, SESSION_OPEN_TIMEOUT_MS);
            session.open((err) => {
                clearTimeout(timer);
                if (err) {
                    reject(err);
                } else {
                    session.createClient(
                        {
                            usePrimaryChannel: true,
                            maxPreservingTickSize:
                                this._param.maxPreservingTickSize,
                        },
                        (err, client) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(client!);
                            }
                        },
                    );
                }
            });
        });
    }

    _subscribePlayEnd(amflow: AMFlowClient) {
        amflow.onPlayEnd(this._onPlayEndBound);
    }

    _unsubscribePlayEnd(runner: RunnerV3) {
        (runner.amflow as AMFlowClient).offPlayEnd(this._onPlayEndBound);
    }

    _onPlayEnd(reason: PlayEndReason) {
        this._report(reason, "storage");
    }

    async _createRunner(playId: number, amflow: AMFlow) {
        const runner = (this._runner = new RunnerV3({
            contentUrl: this._param.contentUrl,
            assetBaseUrl: this._param.assetBaseUrl,
            configurationUrl: this._param.configurationUrl,
            playId: playId.toString(),
            playToken: this._param.playToken,
            runnerId: playId.toString(),
            amflow,
            executionMode: "active",
            trusted: true,
            external: {},
            externalValue: this._createExternalValue(),
            loadFileHandler: (url, encoding, cb) => {
                if (
                    !url.startsWith(this._param.assetBaseUrl) &&
                    !url.startsWith(this._param.configurationUrl)
                ) {
                    cb(new Error(`unallowed url ${url}`));
                    return;
                }
                this._host
                    .fetchAsset(url, encoding)
                    .then((data) => cb(null, data))
                    .catch((err) => cb(err));
            },
        }));
        runner.errorTrigger.add((err) => {
            this._crashing = true;
            console.error(
                "error on runner",
                { runnerId: runner.runnerId, playId },
                err,
                (err as { cause?: unknown }).cause,
            );
            this._report("INTERNAL_ERROR", "runtime-error");
        });
        const game = await runner.start({ paused: false });
        if (!game) {
            throw new Error(
                `failed to start runner (runnerId = "${runner.runnerId}", playId = "${playId}")`,
            );
        }
        return runner;
    }

    _initGame(amflow: AMFlow) {
        amflow.sendEvent([
            EventCode.Join,
            0,
            this._param.playerId,
            this._param.playerName,
        ] as JoinEvent);
        amflow.sendEvent([
            EventCode.Message,
            0,
            ":akashic",
            {
                type: "start",
                parameters: {
                    mode: "multi",
                    service: "nicolive",
                },
            },
        ] as MessageEvent);
    }

    _report(reason: PlayEndReason, origin: PlayEndOrigin) {
        if (this._reported) {
            return;
        }
        this._reported = true;
        this._host.reportPlayEnded(reason, origin);
    }
}
