import type { AMFlow } from "@akashic/amflow";
import { EventCode, JoinEvent, MessageEvent } from "@akashic/playlog";
import { RunnerV3 } from "@akashic/headless-driver";
import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";
import type {
    PlayEndOrigin,
    StartPlayRequest,
    StopPlayResponse,
} from "@multi-indiegame/runner-ipc-schema";
import {
    AMFlowClient,
    Session,
    SessionLike,
} from "@multi-indiegame/playlog-client";
import type { ControlClient } from "./controlClient";
import type { LogSender } from "./logSender";
import { playStorage } from "./logger";

// `akashic-gameview` の ProtocolType と同じ。
const ProtocolType = {
    WebSocket: 0,
} as const;

export class ExecRunner {
    _param: StartPlayRequest;
    _control: ControlClient;
    _runner?: RunnerV3;
    _session?: SessionLike;
    _onPlayEndBound: (reason: PlayEndReason) => void;
    _logSender?: LogSender;
    _crashing = false;
    _errorLogged = false;
    _reported = false;

    constructor(param: StartPlayRequest, control: ControlClient) {
        this._param = param;
        this._control = control;
        this._onPlayEndBound = this._onPlayEnd.bind(this);
    }

    async start() {
        const playId = this._param.playId;
        this._logSender = this._control.openLogSender(playId);
        await playStorage.run(
            { playId, logSink: this._logSender },
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

    async stop() {
        if (this._runner) {
            this._unsubscribePlayEnd(this._runner);
            this._runner.stop();
            this._runner = undefined;
        }
        if (this._session) {
            await this._closeSession(this._session);
            this._session = undefined;
        }
        // 未送出のログを送り切ってから応答する。ここまでのログが content-log に載る。
        if (this._logSender) {
            await this._logSender.close();
            this._logSender = undefined;
        }
        return {
            ok: true,
            crashed: this._crashing,
            errorLogged: this._errorLogged,
        } as StopPlayResponse;
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
            session.open((err) => {
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
            externalValue: {},
            loadFileHandler: (url, encoding, cb) => {
                if (
                    !url.startsWith(this._param.assetBaseUrl) &&
                    !url.startsWith(this._param.configurationUrl)
                ) {
                    cb(new Error(`unallowed url ${url}`));
                    return;
                }
                this._control
                    .fetchAsset(playId, url, encoding)
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
        this._control
            .reportPlayEnded({ playId: this._param.playId, reason, origin })
            .catch((err) => {
                console.warn(
                    "failed to notify control of play end",
                    { playId: this._param.playId },
                    err,
                );
            });
    }
}
