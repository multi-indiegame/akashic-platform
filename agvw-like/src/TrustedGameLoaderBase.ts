import type * as g from "@akashic/akashic-engine";
import type { AMFlow } from "@akashic/amflow";
import type {
    CascadeGameConfiguration,
    GameConfiguration,
} from "@akashic/game-configuration";
import type * as GameDriver from "@akashic/game-driver";
import type {
    Game,
    GameDriver as Driver,
    GameDriverInitializeParameterObject,
    LoopConfiguration,
    MemoryAmflowClient,
} from "@akashic/game-driver";
import type * as PdiBrowser from "@akashic/pdi-browser";
import type { Platform, PlatformParameterObject } from "@akashic/pdi-browser";
import type { ProxyAudioHandlerSet } from "@akashic/pdi-browser/lib/full/plugin/ProxyAudioPlugin/ProxyAudioHandlerSet";
import type { Event } from "@akashic/playlog";
import type * as PlaylogClient from "@multi-indiegame/playlog-client";
import { ExecutionMode, ProtocolType } from "./akashic-gameview";
import { ErrorFactory } from "./Error";
import { EngineConfig, GameLoaderCustomizer } from "./GameContent";
import {
    isEngineFilesUrl,
    detectEngineFilesObject,
    isPlaylogClientUrl,
    detectPlaylogClientObject,
    detectRuntimes,
} from "./detectEngineFileObject";
import { createProxyAudioPluginClass } from "./createProxyAudioPluginClass";
import { GameLoader, GameLoaderStartParameterObject } from "./GameLoader";

export interface AcquirePlaylogClientAMFlowInfo {
    playlogServerUrl: string;
    /**
     * {@link ProtocolType}
     */
    protocol: number;
    playId: string;
    playToken: string;
}

export interface TrustedGameLoaderBaseParameterObject {
    customizer: GameLoaderCustomizer | undefined;
    engineConfig: EngineConfig;
    audioPdiHandler: ProxyAudioHandlerSet | undefined;
    window: Window | undefined;
}

export abstract class TrustedGameLoaderBase implements GameLoader {
    static REALTIME_DELAY_IGNORE_THRESHOLD = 6;
    static REALTIME_JUMP_TRY_THRESHOLD = 30000;

    _playId: undefined | string;
    _playToken: string;
    /**
     * {@link ExecutionMode}
     */
    _agvExecutionMode: number | null;
    _playlogServerUrl: string;
    /**
     * {@link ProtocolType}
     */
    _protocol: number;
    _amflowClient: AMFlow | null;
    _g: typeof g | null;
    _GameDriver: typeof GameDriver | null;
    _PdiBrowser: typeof PdiBrowser | null;
    _usingCustomAmflow: boolean;
    _isLoadEnded: boolean;
    _isPaused: boolean;
    _destroyed: boolean;
    isTestbed: boolean;
    game: Game | null;
    driver: Driver | null;
    platform: Platform | null | undefined;
    fps: number;
    resizablePrimarySurface: boolean;
    _replayOriginDateOffset: number;
    _customizer: GameLoaderCustomizer | undefined;
    _engineConfig: EngineConfig;
    _audioPdiHandler: ProxyAudioHandlerSet | undefined;
    _globalObject: Window;
    _param: GameLoaderStartParameterObject | null;
    _rawLoadGameConfiguration: Platform["loadGameConfiguration"] | null;

    constructor(param: TrustedGameLoaderBaseParameterObject) {
        this._playId = undefined;
        this._playToken = "";
        this._agvExecutionMode = null;
        this._playlogServerUrl = "";
        this._protocol = ProtocolType.WebSocket;
        this._amflowClient = null;
        this._g = null;
        this._GameDriver = null;
        this._PdiBrowser = null;
        this._usingCustomAmflow = false;
        this._isLoadEnded = false;
        this._isPaused = false;
        // NOTE: 元のコードは何故か一回 null に代入している
        // this._engineConfig = null;
        this._destroyed = false;
        this.isTestbed = false;
        this.game = null;
        this.driver = null;
        this.platform = null;
        this.fps = 0;
        this.resizablePrimarySurface = false;
        this._replayOriginDateOffset = 0;
        this._customizer = param.customizer;
        this._engineConfig = param.engineConfig;
        this._audioPdiHandler = param.audioPdiHandler;
        this._globalObject = param.window ?? window;
        this._param = null;
        (this, (this._rawLoadGameConfiguration = null));
    }

    start(param: GameLoaderStartParameterObject) {
        this._param = param;
        this._isPaused = param.pause;
        this._downloadScripts();
    }

    _downloadScripts() {
        const additionalScripts = this._getAdditionalScripts(
            this._engineConfig,
        );
        const urls = [...this._engineConfig.engine_urls, ...additionalScripts];
        const scriptUrls = urls.filter(
            (url) =>
                !(
                    (isEngineFilesUrl(url) &&
                        detectEngineFilesObject(this._globalObject, url)) ||
                    (isPlaylogClientUrl(url) &&
                        detectPlaylogClientObject(this._globalObject, url))
                ),
        );
        this._loadScripts(this._globalObject, scriptUrls, (err) => {
            // NOTE: _param は start() で代入済み
            if (err) {
                this._param!.errorHandler(
                    ErrorFactory.createHttpRequestError(err),
                );
            } else {
                const [err, runtime] = detectRuntimes(this._globalObject, urls);
                if (err) {
                    this._param!.errorHandler(err);
                } else {
                    this._g = runtime.g;
                    this._GameDriver = runtime.GameDriver;
                    this._PdiBrowser = runtime.PdiBrowser;
                    this._initializeSessionManagerIfNeeded(
                        runtime.PlaylogClient,
                    );
                    this._playId = this._param!.playConfig.playId;
                    this._agvExecutionMode =
                        this._param!.playConfig.executionMode;
                    this.isTestbed =
                        "playlogServerUrl" in this._param!.playConfig;
                    if (this._param!.replayData) {
                        setTimeout(() => this._startReplayGame(), 0);
                    } else {
                        if (this.isTestbed) {
                            setTimeout(() => this._startPlaylogGame(), 0);
                        } else {
                            setTimeout(() => this._startStandaloneGame(), 0);
                        }
                    }
                }
            }
        });
    }

    _startReplayGame() {
        // NOTE: _param.replayData が存在するとき本メソッドは呼ばれる
        const replayData = this._param!.replayData!;
        // NOTE: _GameDriver, _playId は _downloadScripts() の中で代入済み
        this._amflowClient = new this._GameDriver!.MemoryAmflowClient({
            playId: this._playId!,
            tickList: replayData.tickList,
            startPoints: replayData.startPoints,
        });
        if (
            this._param!.playConfig.replayTargetTimeFunc &&
            replayData.startPoints &&
            replayData.startPoints[0]
        ) {
            const timestamp = replayData.startPoints[0].timestamp;
            let replayTargetTime =
                this._param!.playConfig.replayTargetTimeFunc();
            if (this._param!.playConfig.replayOriginDate) {
                replayTargetTime += this._param!.playConfig.replayOriginDate;
            }
            this._replayOriginDateOffset = timestamp - replayTargetTime;
        }
        setTimeout(() => this._startGame(), 0);
    }

    _startStandaloneGame() {
        if (this._customizer?.createCustomAmflowClient) {
            this._amflowClient = this._customizer.createCustomAmflowClient();
            this._usingCustomAmflow = true;
        } else {
            // NOTE: _GameDriver, _playId は _downloadScripts() の中で代入済み
            this._amflowClient = new this._GameDriver!.MemoryAmflowClient({
                playId: this._playId!,
            });
        }
        setTimeout(() => this._startGame(), 0);
    }

    _startPlaylogGame() {
        // NOTE: _param は start() で代入済み
        const playConfig = this._param!.playConfig;
        this._playToken = playConfig.playToken;
        // NOTE: playlogServerUrl が存在するとき本メソッドが実行される
        this._playlogServerUrl = playConfig.playlogServerUrl!;
        this._protocol = playConfig.protocol ?? ProtocolType.WebSocket;
        if (this._customizer?.createCustomAmflowClient) {
            this._amflowClient = this._customizer.createCustomAmflowClient();
            this._usingCustomAmflow = true;
            setTimeout(() => this._startGame(), 0);
        } else {
            // NOTE: _GameDriver, _playId は _downloadScripts() の中で代入済み
            this._acquirePlaylogClientAMFlow(
                {
                    playlogServerUrl: this._playlogServerUrl,
                    protocol: this._protocol,
                    playId: this._playId!,
                    playToken: this._playToken,
                },
                (err, client) => {
                    if (err) {
                        this._param!.errorHandler(
                            ErrorFactory.createPlaylogError(err),
                        );
                    } else {
                        this._amflowClient = client;
                        this._startGame();
                    }
                },
            );
        }
    }

    _startGame() {
        // NOTE: 例外発生時 undefined が return される。
        const platform = this._createPlatform()!;
        const driver = this._createGameDriver(platform);
        // 元は handle だが今の推奨にあわせて変更
        driver.gameCreatedTrigger.add((game) => {
            this.game = game;
            if ("abortTrigger" in this.game) {
                // NOTE: _param は start() で代入済み
                this.game.abortTrigger.add(() => {
                    this._param!.errorHandler(
                        ErrorFactory.createAbortGameError(undefined),
                    );
                });
            }
            this._param!.gameCreatedHandler(game);
        });
        this.driver = driver;
        this.platform = platform;
        setTimeout(() => this._startGameDriver(driver), 0);
    }

    _createPlatform() {
        try {
            // NOTE: _param は start() で代入済み
            // NOTE: _amflowClient は _startXXXGame() で代入済み
            const param: PlatformParameterObject = {
                amflow: this._amflowClient!,
                containerView: this._param!.parentHtmlElement,
                audioPlugins: this._createAudioPlugins(),
            };
            this._overwritePlatformParameter(param);
            // NOTE: _PdiBrowser, _g は _downloadScripts() で代入済み
            const platform = new this._PdiBrowser!.Platform(param);
            if (this._customizer?.platformCustomizer) {
                this._customizer.platformCustomizer(platform, { g: this._g! });
            }
            // NOTE: 効果のない呼び出しと思われるが、そのまま移植。
            platform.usingPointerEvents;
            this._rawLoadGameConfiguration = platform.loadGameConfiguration;
            platform.loadGameConfiguration = (url, cb) => {
                this._customLoadGameConfiguration(url, (err, config) => {
                    // NOTE: おそらく config は GameConfiguration だと思われるが、
                    // surface というパラメタは存在しない。おそらく内部で使っているのだろう。
                    if (
                        ((config as GameConfiguration).environment as any)
                            ?.surface?.resizablePrimary
                    ) {
                        this.resizablePrimarySurface = true;
                    }
                    cb(err, config);
                });
            };
            return platform;
        } catch (err) {
            this._param?.errorHandler(
                ErrorFactory.createLoadModuleError(err as Error),
            );
            return undefined;
        }
    }

    _customLoadGameConfiguration(
        url: string,
        cb: (
            err: Error | null,
            config: CascadeGameConfiguration | GameConfiguration,
        ) => void,
    ) {
        // NOTE: _rawLoadGameConfiguration は _createPlatform() で代入済み
        // NOTE: _param は start() で代入済み
        if (url !== "<agvw-queryparam>") {
            if (url !== "<agvw-configuration>") {
                if (this._param!.contentUrl.indexOf("?") !== -1) {
                    this._rawLoadGameConfiguration!(url, cb);
                } else {
                    setTimeout(() => {
                        cb(null, {
                            definitions: [
                                {
                                    url: "<agvw-configuration>",
                                    basePath: this._getAssetBase(),
                                },
                                "<agvw-queryparam>",
                            ],
                        });
                    }, 0);
                }
            } else {
                this._rawLoadGameConfiguration!(
                    this._engineConfig.content_url,
                    cb,
                );
            }
        } else {
            const param = this._param!.contentUrl.slice(
                this._param!.contentUrl.indexOf("?") + 1,
            )
                .split("&")
                .reduce(
                    (param, current) => {
                        const [key, value] = current.split("=");
                        try {
                            param[key] = JSON.parse(decodeURIComponent(value));
                        } catch (err) {}
                        return param;
                    },
                    {} as Record<string, unknown>,
                );
            setTimeout(
                () => cb(null, param as unknown as CascadeGameConfiguration),
                0,
            );
        }
    }

    _createGameDriver(platform: Platform) {
        // NOTE: _GameDriver は _downloadScripts() で代入済み
        // NOTE: _param は start() で代入済み
        return new this._GameDriver!.GameDriver({
            platform,
            player: this._param!.player,
            errorHandler: (err) => {
                this._param!.errorHandler(
                    ErrorFactory.createGameDriverError(err),
                );
            },
        });
    }

    _startGameDriver(driver: Driver) {
        driver.initialize(this._createInitializeParameter(), (err) => {
            // NOTE: _param は start() で代入済み
            if (err) {
                this._param!.errorHandler(
                    ErrorFactory.createGameDriverError(err),
                );
            } else {
                if (!this._param!.replayData) {
                    this._sendinitialEvents();
                }
                if (!this._isPaused) {
                    this.driver!.startGame();
                }
                this._isLoadEnded = true;
                if (this._destroyed) {
                    this.stopGame();
                }
            }
        });
    }

    _createInitializeParameter() {
        // NOTE: _param は start() で代入済み
        const isActive =
            this._agvExecutionMode === ExecutionMode.Active &&
            !this._param!.replayData;
        const isReplay =
            this._param!.replayData ||
            this._agvExecutionMode === ExecutionMode.Replay;
        const executionMode = isActive
            ? ExecutionMode.Active
            : ExecutionMode.Passive;
        const offset =
            this._param!.playConfig.replayOriginDate != null
                ? this._param!.playConfig.replayOriginDate +
                  this._replayOriginDateOffset
                : this._replayOriginDateOffset;
        const loopConfiguration = isReplay
            ? this._createLoopConfigurationForReplay(
                  this._param!.playConfig.replayTargetTimeFunc,
                  offset,
              )
            : this._createLoopConfigurationForRealtime(
                  this._param!.playConfig.replayTargetTimeFunc,
                  offset,
              );
        return {
            configurationUrl: this._engineConfig.content_url,
            assetBase: this._getAssetBase(),
            profiler: this._getProfiler(),
            gameArgs: this._param!.argument,
            driverConfiguration: {
                // NOTE: _playId は _downloadScripts() の中で代入済み
                playId: this._playId!,
                playToken: this._playToken,
                executionMode,
                eventBufferMode: {
                    isSender: !this._isPaused && !isActive && !isReplay,
                    isReceiver: isActive,
                    isDiscarder: this._isPaused,
                },
            },
            loopConfiguration,
        } satisfies GameDriverInitializeParameterObject;
    }

    _getAssetBase() {
        if (this._engineConfig.asset_base_url) {
            return this._engineConfig.asset_base_url;
        } else {
            return (
                // 元は substr のため推奨の substring に書き換え
                this._engineConfig.content_url.substring(
                    0,
                    this._engineConfig.content_url.lastIndexOf("/"),
                ) + "/"
            );
        }
    }

    _getProfiler() {
        // NOTE: _GameDriver は _downloadScripts() の中で代入済み
        return new this._GameDriver!.SimpleProfiler({
            interval: 200,
            getValueHandler: (v) => {
                this.fps = v.framePerSecond.ave;
            },
        });
    }

    _sendinitialEvents() {
        // NOTE: _param は start() で代入済み
        if (this._param!.initialEvents) {
            try {
                for (const ev of this._param!.initialEvents) {
                    // NOTE: _amflowClient は _startXXXGame() で代入済み
                    this._amflowClient!.sendEvent(ev);
                }
            } catch (err) {
                this._param!.errorHandler(
                    ErrorFactory.createPlaylogError(err as Error),
                );
            }
        }
    }

    pauseGame() {
        if (this._isPaused) {
            return;
        }
        this._isPaused = true;
        if (this._isLoadEnded) {
            // NOTE: driver, game は _startGame() で代入済み
            this.driver!._eventBuffer!.setMode({
                isSender: false,
                isDiscarder: true,
            });
            this.driver!.stopGame();
            this.game!._setMuted(true);
        }
    }

    resumeGame() {
        if (this._isPaused) {
            this._isPaused = false;
        }
        if (this._isLoadEnded) {
            // NOTE: driver, game は _startGame() で代入済み
            this.driver!.startGame();
            this.driver!._eventBuffer!.setMode({
                isSender:
                    this._agvExecutionMode !== ExecutionMode.Active &&
                    this._agvExecutionMode !== ExecutionMode.Replay,
                isDiscarder: false,
            });
            this.game!._setMuted(false);
        }
    }

    isPaused() {
        return this._isPaused;
    }

    stopGame() {
        this._destroyed = true;
        if (this._isLoadEnded) {
            // NOTE: driver, game は _startGame() で代入済み
            // NOTE: 元のコードでは stopAll の存在をチェックしている。もしかすると V3 以前はなかったのかもしれない
            this.game!.audio.stopAll();
            this.game!.audio.music.stopAll();
            this.game!.audio.sound.stopAll();
            this.driver!.stopGame();
            // NOTE: 元のコードは null を代入しているが、スキーマ定義にあわせ undefined にしている
            this.driver!.initialize(
                {
                    driverConfiguration: {
                        playId: undefined,
                    },
                    configurationUrl: undefined,
                },
                () => {
                    if (this.isTestbed && !this._usingCustomAmflow) {
                        this._releasePlaylogClientAMFlow(
                            this._playlogServerUrl,
                        );
                    }
                    this._amflowClient = null;
                    this._g = null;
                    this._GameDriver = null;
                    this._PdiBrowser = null;
                    this.game = null;
                    this.platform = null;
                    // NOTE: 元のコードでは destroyの存在チェックをしているが、もしかすると V3 以前はなかったのかもしれない
                    this.driver!.destroy().then(() =>
                        // NOTE: _param は start() で代入済み
                        this._param!.gameFinishedHandler(),
                    );
                },
            );
        }
    }

    sendEvents(list: Event[]) {
        try {
            // NOTE: driver は _startGame() で代入済み
            if (this.driver!._eventBuffer?.onEvent) {
                for (const ev of list) {
                    this.driver!._eventBuffer.onEvent(ev);
                }
            } else {
                for (const ev of list) {
                    // NOTE: _amflowClient は _startXXXGame() で代入済み
                    this._amflowClient!.sendEvent(ev);
                }
            }
        } catch (err) {
            // NOTE: _param は start() で代入済み
            this._param!.errorHandler(
                ErrorFactory.createPlaylogError(err as Error),
            );
        }
    }

    dumpPlaylog() {
        // NOTE: _amflowClient は _startXXXGame() で代入済み
        // NOTE: 元のコードは _amflowClient.dump の値が Truthy かチェックしているが、
        // dump === undefined なことはないと判断し、 in で判定（無用なasを消したかった）
        if (this.isTestbed || !("dump" in this._amflowClient!)) {
            return null;
        } else {
            return (this._amflowClient! as MemoryAmflowClient).dump();
        }
    }

    getGameVars(key: string, cb: (value: unknown) => void) {
        setTimeout(() => {
            // おそらく game は存在するが、念の為元のコードのまま移植
            if (this.game) {
                cb(this.game.vars && this.game.vars[key]);
            }
        }, 0);
    }

    /**
     * @param mode {@link ExecutionMode}
     */
    setExecutionMode(mode: number) {
        if (!this.driver) {
            return false;
        }
        if (!this.driver._gameLoop || !this.driver._eventBuffer) {
            return false;
        }
        if (this._agvExecutionMode === mode) {
            return true;
        }
        const isActive = this._agvExecutionMode === ExecutionMode.Active;
        // NOTE: _param は start() で代入済み
        const isReplay =
            this._param!.replayData ||
            this._agvExecutionMode === ExecutionMode.Replay;
        this.driver._gameLoop.setExecutionMode(
            isActive ? ExecutionMode.Active : ExecutionMode.Passive,
        );
        this.driver._gameLoop.setLoopConfiguration(
            isReplay
                ? this._createLoopConfigurationForReplay()
                : this._createLoopConfigurationForRealtime(),
        );
        this.driver._eventBuffer.setMode({
            isSender: !isActive && !isReplay,
            isReceiver: isActive,
        });
        return true;
    }

    _createLoopConfigurationForRealtime(
        targetTimeFunc?: () => number,
        originDate?: number,
    ) {
        // NOTE: _GameDriver,は _downloadScripts() の中で代入済み
        return {
            loopMode: this._GameDriver!.LoopMode.Realtime,
            delayIgnoreThreshold:
                TrustedGameLoaderBase.REALTIME_DELAY_IGNORE_THRESHOLD,
            jumpTryThreshold: TrustedGameLoaderBase.REALTIME_JUMP_TRY_THRESHOLD,
            targetTimeFunc,
            originDate,
        } satisfies LoopConfiguration;
    }

    _createLoopConfigurationForReplay(
        targetTimeFunc?: () => number,
        originDate?: number,
    ) {
        // NOTE: _GameDriver,は _downloadScripts() の中で代入済み
        return {
            loopMode: this._GameDriver!.LoopMode.Replay,
            delayIgnoreThreshold: Number.MAX_VALUE,
            jumpTryThreshold: Number.MAX_VALUE,
            targetTimeFunc,
            originDate,
        } satisfies LoopConfiguration;
    }

    getExecutionMode() {
        // NOTE: _param は start() で代入済み
        return this._agvExecutionMode ?? this._param!.playConfig.executionMode;
    }

    setReplayTargetTimeFunc(targetTimeFunc: () => number) {
        if (this.driver?._gameLoop) {
            // NOTE: 元の実装では 必須パラメタの loopMode を指定していない。念の為そのまま移植
            this.driver._gameLoop.setLoopConfiguration({
                targetTimeFunc,
            } as LoopConfiguration);
            return true;
        } else {
            return false;
        }
    }

    getReplayTargetTimeFunc() {
        if (!this.driver) {
            return null;
        }
        return this.driver.getLoopConfiguration()?.targetTimeFunc ?? null;
    }

    setReplayOriginDate(date: number) {
        if (this.driver?._gameLoop) {
            // NOTE: 元の実装では 必須パラメタの loopMode を指定していない。念の為そのまま移植
            this.driver._gameLoop.setLoopConfiguration({
                originDate: date + this._replayOriginDateOffset,
            } as LoopConfiguration);
            return true;
        } else {
            return false;
        }
    }

    getReplayOriginDate() {
        if (!this.driver || !this.driver._gameLoop) {
            return null;
        }
        return this.driver._gameLoop._startedAt || null;
    }

    getReplayOriginDateOffset() {
        return this._replayOriginDateOffset;
    }

    getPlayOriginDate() {
        if (!this.driver || !this.driver._gameLoop) {
            return null;
        }
        return this.driver._gameLoop._startedAt || null;
    }

    resetPrimarySurface(width: number, height: number) {
        this.driver?.resetPrimarySurface(width, height);
    }

    setScale(xScale: number, yScale: number) {
        // NOTE: platform は _startGame() で代入済み
        this.platform!.setScale(xScale, yScale);
    }

    setMasterVolume(volume: number) {
        // NOTE: platform は _startGame() で代入済み
        this.platform!.setMasterVolume(volume);
    }

    getMasterVolume() {
        // NOTE: platform は _startGame() で代入済み
        return this.platform!.getMasterVolume();
    }

    setTabIndex(tabIndex: string) {
        // NOTE: platform は _startGame() で代入済み
        this.platform!.setTabIndex(tabIndex);
    }

    _overwritePlatformParameter(param: PlatformParameterObject) {}

    _createAudioPlugins() {
        if (this._customizer?.createCustomAudioPlugins) {
            return this._customizer.createCustomAudioPlugins();
        } else {
            if (this._audioPdiHandler) {
                // NOTE: _g は _downloadScripts() で代入済み
                return [
                    createProxyAudioPluginClass(
                        this._g!,
                        this._audioPdiHandler,
                    ),
                ];
            } else {
                return [
                    this._PdiBrowser!.WebAudioPlugin,
                    this._PdiBrowser!.HTMLAudioPlugin,
                ];
            }
        }
    }

    abstract _getAdditionalScripts(engineConfig: EngineConfig): string[];

    abstract _initializeSessionManagerIfNeeded(
        playlogClient: typeof PlaylogClient,
    ): void;

    abstract _releasePlaylogClientAMFlow(playlogServerUrl: string): void;

    abstract _loadScripts(
        globalObject: Window,
        scriptUrls: string[],
        cb: (err: Error | null) => void,
    ): void;

    abstract _acquirePlaylogClientAMFlow(
        info: AcquirePlaylogClientAMFlowInfo,
        cb: (err: Error | null, client: AMFlow | null) => void,
    ): void;
}
