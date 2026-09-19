"use server";

import type { GameConfiguration } from "@akashic/game-configuration";
import { internalContentBaseUrl } from "./akashic";
import { logSafe } from "./log-safe";

const implicitExternalMapper: { external: string; keywords: string[] }[] = [
    {
        external: "coe",
        keywords: ["@akashic-extension/coe"],
    },
];

/**
 * coe plugin は game.json に明示的に使われていることが現れないので別途判定
 */
function getImplicitExternal(gameJson: GameConfiguration) {
    const externals = new Set<string>();
    for (const { external, keywords } of implicitExternalMapper) {
        if (
            Object.keys(gameJson.moduleMainPaths ?? {}).some((main) =>
                keywords.includes(main),
            )
        ) {
            externals.add(external);
            continue;
        }
        if (
            Object.keys(gameJson.moduleMainScripts ?? {}).some((main) =>
                keywords.includes(main),
            )
        ) {
            externals.add(external);
            continue;
        }
        if (
            gameJson.globalScripts?.some((script) =>
                // 前方一致によるご判定を防止するため / をつけている
                keywords.some((keyword) => script.includes(`${keyword}/`)),
            )
        ) {
            externals.add(external);
            continue;
        }
    }
    return [...externals];
}

export async function getContentExternal(gameJson: GameConfiguration) {
    const explicitExternal = Object.keys(gameJson.environment?.external ?? {});
    const implicitExternal = getImplicitExternal(gameJson);
    return [...new Set([...implicitExternal, ...explicitExternal])];
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
        const res = await fetch(`${internalContentBaseUrl}/${id}/game.json`);
        return await getContentExternal(await res.json());
    } catch (err) {
        console.warn(
            "failed to fetch external in game.json. (contentId = %s)",
            id,
        );
        return [];
    }
}
