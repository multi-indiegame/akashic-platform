import type { PlayEndReason } from "@multi-indiegame/amflow-server-event-schema";
import { AMFlowServerManager } from "./AMFlowServerManager";

interface PlayManagerParameterObject {
    amfManager: AMFlowServerManager;
}

export class PlayManager {
    _amfManager: AMFlowServerManager;

    constructor(param: PlayManagerParameterObject) {
        this._amfManager = param.amfManager;
    }

    start(playId: string) {
        return this._amfManager.start(playId);
    }

    async end(playId: string, reason: PlayEndReason) {
        await this._amfManager.end(playId, reason);
    }
}
