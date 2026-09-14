import type {
    PlayEndReason,
    PlayExtendPayload,
} from "@yasshi2525/amflow-client-event-schema";
import type { AMFlowClient } from "@yasshi2525/playlog-client-like";
import {
    AkashicGameView,
    ExecutionMode,
    GameContent,
} from "@yasshi2525/agvw-like";
import {
    type PlayerBanBackend,
    PlayerBanPlugin,
} from "@multi-indiegame/akashic-player-ban-plugin";
import { User } from "../types";
import { destroyAkashicGameView } from "./akashic-gameview-destroyer";
import { LogStore } from "./log-store";
import { LogHandler } from "./log-handler";
import {
    CoeLimitedPlugin,
    ResolvingPlayerInfoRequest,
} from "./akashic-plugins/coe-limited-plugin";
import { CoePlugin } from "./akashic-plugins/coe-plugin";
import { SendPlugin } from "./akashic-plugins/send-plugin";

interface AkashicContainerCreateParameterObject {
    parent: HTMLDivElement;
    user: User;
    /** ゲームに申告する playerId。guest_id を秘匿するためサーバーで非可逆化した値 */
    playerId: string;
    contentId: number;
    playId: string;
    playToken: string;
    playlogServerUrl: string;
    initialMasterVolume?: number;
    isGameMaster: boolean;
    external: string[];
    onSkip: (skip: boolean) => void;
    onError: (errMsg: string) => void;
    onOpenTroubleshoot: () => void;
    onPlayEnd: (reason: PlayEndReason) => void;
    onPlayExtend: (payload: PlayExtendPayload) => void;
    onRequestPlayerInfo: (
        param: ResolvingPlayerInfoRequest | undefined,
    ) => void;
    playerBanBackend: PlayerBanBackend;
}

export class AkashicContainer {
    _current?: {
        view: AkashicGameView;
        resizeObserver: ResizeObserver;
        content: GameContent;
        logStore: LogStore;
        logHandler: LogHandler;
    };
    _creationQueue: AkashicContainerCreateParameterObject[];
    _clientLogMaxEntries?: number;

    constructor() {
        this._creationQueue = [];
    }

    create(param: AkashicContainerCreateParameterObject) {
        // 2つの view が存在すると、挙動として古いほうが止まる
        // 過去を破棄してから新規作成する
        if (this._current) {
            this._creationQueue.push(param);
        } else {
            const view = new AkashicGameView({
                container: param.parent,
                width: param.parent.clientWidth,
                height: param.parent.clientHeight,
                // NOTE: untrusted のときこの値が使用される。 akashic-cli-serve の値としている。
                trustedChildOrigin: /.*/,
            });
            const resizeObserver = this._createResizeObserver(
                param.parent,
                view,
            );
            view.registerExternalPlugin(new SendPlugin());
            view.registerExternalPlugin(new CoePlugin());
            view.registerExternalPlugin(
                new CoeLimitedPlugin({
                    onRequest: param.onRequestPlayerInfo,
                }),
            );
            view.registerExternalPlugin(
                new PlayerBanPlugin(param.playerBanBackend),
            );
            const logStore = new LogStore(this._clientLogMaxEntries);
            const logHandler = new LogHandler(logStore);
            const content = this._createContent(param, logHandler);
            view.addContent(content);
            this._current = {
                view,
                resizeObserver,
                content,
                logStore,
                logHandler,
            };
        }
    }

    async destroy() {
        if (this._current) {
            this._current.resizeObserver.disconnect();
            await destroyAkashicGameView(this._current.view);
            this._current.logStore.clear();
            this._current = undefined;
            const next = this._creationQueue.shift();
            if (next) {
                this.create(next);
            }
        }
    }

    setMasterVolume(volume: number) {
        if (this._current) {
            this._current.content.setMasterVolume(volume);
        }
    }

    setClientLogMaxEntries(max: number) {
        this._clientLogMaxEntries = max;
        if (this._current) {
            this._current.logStore.setMaxEntries(max);
        }
    }

    isClientLogTruncated() {
        return this._current?.logStore.truncated ?? false;
    }

    getClientLogs() {
        return this._current?.logStore.getAll() ?? [];
    }

    clearClientLogs() {
        this._current?.logStore.clear();
    }

    getGameContentCanvas(): HTMLCanvasElement | undefined {
        return (
            this._current?.content._element
                ?.getContentWindow()
                ?.document.getElementById("container")
                ?.querySelector("canvas") ?? undefined
        );
    }

    _createContent(
        param: AkashicContainerCreateParameterObject,
        logHandler: LogHandler,
    ) {
        const content = new GameContent({
            player: {
                // guest_id を秘匿するため、ゲーム上の id はサーバー派生の playerId を使う
                id: param.playerId,
                name: param.user.name,
            },
            playConfig: {
                playId: param.playId,
                playToken: param.playToken,
                executionMode: ExecutionMode.Passive,
                playlogServerUrl: `${param.playlogServerUrl}/socket.io`,
            },
            contentUrl: `/api/content/${param.contentId}`,
            runInIframe: true,
            argument: this._createContentArgument(param),
        });
        content.addSkippingListener({
            onSkip: (isSkipping) => {
                param.onSkip(isSkipping);
            },
        });
        const handleError = (err: unknown) => {
            param.onError(
                "予期しないエラーが発生したため、ゲームを停止しました。ゲームの再開を試みる場合は画面を更新してください。",
            );
            console.error(err);
            content.pause();
            param.onOpenTroubleshoot();
        };
        content.addErrorListener({
            onError: handleError,
        });
        content.addContentLoadListener({
            onLoad: () => {
                if (param.initialMasterVolume != null) {
                    content.setMasterVolume(param.initialMasterVolume);
                }
                const win = content._element?.getContentWindow();
                if (win) {
                    win.document.body.children[0].id = "container";
                    const style = win.document.createElement("style");
                    style.textContent =
                        "* { user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; touch-action: none; }";
                    win.document.head.appendChild(style);
                    logHandler.captureUncaughtError(win);
                    logHandler.captureConsole((win as any).console);
                    win.addEventListener("error", (event) =>
                        handleError(event.error || event.message),
                    );
                }
                const driver = content.getGameDriver()!;
                driver.errorTrigger.add(handleError);
                const amflowcontent = driver._platform.amflow as AMFlowClient;
                amflowcontent.onPlayEnd((reason) => param.onPlayEnd(reason));
                amflowcontent.onPlayExtend((payload) =>
                    param.onPlayExtend(payload),
                );
            },
        });
        return content;
    }

    _createResizeObserver(target: HTMLDivElement, view: AkashicGameView) {
        const observer = new ResizeObserver((entries) => {
            for (const e of entries.filter((e) => e.target === target)) {
                view.setViewSize(e.contentRect.width, e.contentRect.height);
                for (const content of Object.values(view._contents)) {
                    content.setContentArea({
                        x: 0,
                        y: 0,
                        width: e.contentRect.width,
                        height: e.contentRect.height,
                    });
                }
            }
        });
        observer.observe(target);
        return observer;
    }

    _createContentArgument(param: AkashicContainerCreateParameterObject) {
        if (param.external.includes("coe")) {
            return {
                coe: {
                    permission: {
                        advance: false,
                        advanceRequest: param.isGameMaster,
                        aggregation: false,
                    },
                    roles: param.isGameMaster ? ["broadcaster"] : [],
                    debugMode: false,
                },
            };
        } else {
            return undefined;
        }
    }
}
