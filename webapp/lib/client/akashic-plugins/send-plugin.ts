import type { COEExternalMessage } from "@akashic-extension/coe-messages";
import type { Game } from "@akashic/game-driver";
import type { MemoryQueueDataBus } from "@cross-border-bridge/memory-queue-data-bus";
import type { ExternalPlugin, GameContent } from "@multi-indiegame/agvw";

// NOTE: 参考 akashic-cli-serve の実装
// NOTE: 何かしている訳ではない
export class SendPlugin implements ExternalPlugin {
    name: string = "send";
    onload(game: Game, databus: MemoryQueueDataBus, content: GameContent) {
        game.external.send = (message: COEExternalMessage) => {
            console.debug("receive", message);
        };
    }
}
