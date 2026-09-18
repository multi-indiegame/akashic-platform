import type { MemoryQueueDataBus } from "@cross-border-bridge/memory-queue-data-bus";
import type { Game } from "@akashic/game-driver";
import type { COEPlugin } from "@akashic-environment/coe-plugin";
import type { COEEndMessage } from "@akashic-extension/coe-messages";
import type { ExternalPlugin, GameContent } from "@multi-indiegame/agvw";

interface GameState {
    score?: number;
    playThreshold?: number;
    clearThreshold?: number;
}

interface LocalSession {
    gameState?: GameState;
    messageHandler?: (msg: COEEndMessage) => void;
}

// NOTE: 参考 akashic-cli-serve の実装
// NOTE: content を別途読み込む処理はしていない
export class CoePlugin implements ExternalPlugin {
    name: string = "coe";
    _localSessions: Map<string, LocalSession>;

    constructor() {
        this._localSessions = new Map();
    }

    onload(game: Game, databus: MemoryQueueDataBus, content: GameContent) {
        game.external.coe = {
            startSession: ({
                sessionId,
                application,
                local,
                messageHandler,
            }) => {
                if (application == null) {
                    console.error("application is empty.");
                    return;
                }
                if (!local) {
                    console.error("non-local session isn't supported.");
                    return;
                }
                this._localSessions.set(sessionId, {
                    gameState: game.vars.gameState,
                    messageHandler,
                });
            },
            exitSession: (sessionId, parameters) => {
                if (parameters == null || !this._localSessions.has(sessionId)) {
                    return;
                }
                if (parameters.needsResult) {
                    const session = this._localSessions.get(sessionId);
                    if (!session) {
                        console.warn(`invalid session id "${sessionId}"`);
                    } else {
                        session.messageHandler?.({
                            type: "end",
                            sessionId,
                            result: session.gameState?.score,
                        });
                    }
                }
                this._localSessions.delete(sessionId);
            },
            sendLocalEvents: (sessionId, localEvents) => {
                console.warn("not implemented.");
            },
        } satisfies COEPlugin;
    }
}
