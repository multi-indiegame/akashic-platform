import type { MemoryQueueDataBus } from "@cross-border-bridge/memory-queue-data-bus";
import type { Event, MessageEventIndex } from "@akashic/playlog";
import type { Game } from "@akashic/game-driver";
import type { COEExitSessionParameters } from "@akashic-environment/coe-plugin";
import type { COEEndMessage } from "@akashic-extension/coe-messages";
import type { PlayerInfo } from "@akashic-extension/resolve-player-info";
import type { ResolverSessionParameters } from "@akashic-extension/resolve-player-info/lib/types/PlayerInfoResolver";
import type { ExternalPlugin, GameContent } from "@multi-indiegame/agvw";

interface PlayerInfoResolverResultMessage extends COEEndMessage {
    result: PlayerInfo;
}

interface StartLocalSessionParameterObject {
    sessionId: string;
    applicationName: string;
    localEvents: Event[];
    messageHandler: (msg: PlayerInfoResolverResultMessage) => void;
}

interface COELimitedPlugin {
    startLocalSession: (param: StartLocalSessionParameterObject) => void;
    exitLocalSession: (
        sessionId: string,
        param: COEExitSessionParameters,
    ) => void;
}

const ALLOWED_APPLICATION_NAME = "player-info-resolver";
// NOTE: resolve-player-info と同じ値（非エクスポートのため数値で代入）
const DEFAULT_LIMIT_SECONDS = 15;

export interface ResolvingPlayerInfoRequest {
    limitSeconds: number;
    guestName: string;
    onResolve: (accepted: boolean, name: string) => void;
}

interface LocalSession {
    guestName: string;
    messageHandler: (msg: PlayerInfoResolverResultMessage) => void;
}

interface CoeLimitedPluginParameterObject {
    onRequest: (param: ResolvingPlayerInfoRequest | undefined) => void;
}

// NOTE: 参考 akashic-cli-serve の実装
export class CoeLimitedPlugin implements ExternalPlugin {
    name: string = "coeLimited";
    _localSessions: Map<string, LocalSession>;
    _requestHandler: (param: ResolvingPlayerInfoRequest | undefined) => void;

    constructor(param: CoeLimitedPluginParameterObject) {
        this._requestHandler = param.onRequest;
        this._localSessions = new Map();
    }

    onload(game: Game, databus: MemoryQueueDataBus, content: GameContent) {
        game.external.coeLimited = {
            startLocalSession: ({
                sessionId,
                applicationName,
                localEvents,
                messageHandler,
            }) => {
                if (applicationName !== ALLOWED_APPLICATION_NAME) {
                    console.error(`${applicationName} is not allowed.`);
                    return;
                }
                /**
                 * 3 は {@link MessageEventIndex.Data} を指す。
                 * 本環境が isolatedModules = true のため、直接値を参照できない。
                 */
                const localEventData =
                    localEvents[0][3] as ResolverSessionParameters;
                const limitSeconds =
                    localEventData?.parameters?.limitSeconds ??
                    DEFAULT_LIMIT_SECONDS;
                const guestName = "ゲスト" + ((Math.random() * 1000) | 0);
                this._requestHandler({
                    limitSeconds,
                    guestName,
                    onResolve: (accepted, name) => {
                        messageHandler({
                            type: "end",
                            sessionId: sessionId,
                            result: {
                                name,
                                userData: {
                                    accepted,
                                    premium: false,
                                },
                            },
                        });
                        this._requestHandler(undefined);
                    },
                });
                this._localSessions.set(sessionId, {
                    guestName,
                    messageHandler,
                });
            },
            exitLocalSession: (sessionId, param) => {
                if (param.needsResult) {
                    const session = this._localSessions.get(sessionId);
                    if (!session) {
                        console.warn(`invalid session id "${sessionId}"`);
                    } else {
                        session.messageHandler({
                            type: "end",
                            sessionId,
                            result: {
                                name: session.guestName,
                                userData: {
                                    accepted: false,
                                    premium: false,
                                },
                            },
                        });
                    }
                }
                this._localSessions.delete(sessionId);
            },
        } satisfies COELimitedPlugin;
    }
}
