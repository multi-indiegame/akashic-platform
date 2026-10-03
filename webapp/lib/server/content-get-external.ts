"use server";

import type { GameConfiguration } from "@akashic/game-configuration";
import { internalContentBaseUrl } from "./akashic";
import { logSafe } from "./log-safe";
import { listContentExternals } from "../share/content-external";

export async function getContentExternal(gameJson: GameConfiguration) {
    return listContentExternals(gameJson);
}

/**
 * 取得に失敗した場合は例外を投げる。空の一覧と区別が要る場合に使う
 */
export async function fetchContentExternalOrThrow(contentId: number) {
    const res = await fetch(`${internalContentBaseUrl}/${contentId}/game.json`);
    if (!res.ok) {
        throw new Error(
            `failed to fetch game.json (contentId = ${contentId}, status = ${res.status})`,
        );
    }
    return listContentExternals(await res.json());
}

export async function fetchContentExternal(contentId: number | string) {
    const id = Number(contentId);
    if (!Number.isInteger(id) || id < 0) {
        console.warn(
            "invalid contentId for external fetch (contentId = %s)",
            logSafe(contentId),
        );
        return [];
    }
    try {
        return await fetchContentExternalOrThrow(id);
    } catch (err) {
        console.warn(
            "failed to fetch external in game.json. (contentId = %s)",
            id,
        );
        return [];
    }
}
