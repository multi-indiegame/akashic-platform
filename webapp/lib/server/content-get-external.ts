import { prisma } from "@multi-indiegame/persist-schema";
import { internalContentBaseUrl } from "./akashic";
import { logSafe } from "./log-safe";
import {
    exceedsContentExternalLimits,
    listContentExternals,
} from "../share/content-external";

export class ContentExternalLimitError extends Error {}

/**
 * 取得に失敗した場合は例外を投げる。空の一覧と区別が要る場合に使う
 */
export async function fetchContentExternalOrThrow(contentId: number | string) {
    // WHY: contentId は URL のパスに埋め込むため、整数以外 (`../` など) で別のパスを指させない
    const id = Number(contentId);
    if (!Number.isSafeInteger(id) || id < 0) {
        throw new Error(
            `invalid contentId for external fetch (contentId = ${logSafe(contentId)})`,
        );
    }
    const res = await fetch(`${internalContentBaseUrl}/${id}/game.json`);
    if (!res.ok) {
        throw new Error(
            `failed to fetch game.json (contentId = ${id}, status = ${res.status})`,
        );
    }
    return listContentExternals(await res.json());
}

export async function fetchContentExternal(contentId: number | string) {
    try {
        return await fetchContentExternalOrThrow(contentId);
    } catch (err) {
        console.warn(
            "failed to fetch external in game.json. (contentId = %s)",
            logSafe(contentId),
            err,
        );
        return [];
    }
}

/**
 * 使用プラグインを記録する前に投稿されたバージョンについて、game.json から導出して記録する
 */
export async function recordContentExternals(contentId: number) {
    const externals = await fetchContentExternalOrThrow(contentId);
    // この記録より前の投稿は、投稿時に上限を確かめていない
    if (exceedsContentExternalLimits(externals)) {
        throw new ContentExternalLimitError(
            `too many or too long externals in game.json (contentId = ${contentId})`,
        );
    }
    await prisma.$transaction(async (tx) => {
        // 同時に記録されたとき、先に入った必須の申告を任意で上書きしないよう既存の行は残す
        await tx.contentExternal.createMany({
            data: externals.map((name) => ({ contentId, name })),
            skipDuplicates: true,
        });
        await tx.content.update({
            data: { externalsRecorded: true },
            where: { id: contentId },
        });
    });
    return externals;
}
