import { prisma } from "@multi-indiegame/persist-schema";
import { publicContentBaseUrl } from "./akashic";
import { TitleBadge } from "../types";

/** 一度に見せる称号の数 */
const DISPLAY_LIMIT = 4;

/**
 * 表示する称号を集める。
 *
 * WHY: 並び順はまず本人の指定（マイページで並び替えた `pinnedOrder`）、次に
 * 投稿者の `priority`。投稿者が「これを見せたい」と決めた順を既定にしつつ、
 * 本人が自分の見せ方を選べるようにする。
 */
export async function fetchTitles(
    userId: string,
    options: { gameId?: number; limit?: number } = {},
): Promise<TitleBadge[]> {
    const rows = await prisma.scoreTitle.findMany({
        where: {
            userId,
            ...(options.gameId ? { gameId: options.gameId } : {}),
        },
        orderBy: [{ pinnedOrder: { sort: "asc", nulls: "last" } }],
        select: {
            defId: true,
            gameId: true,
            categoryKey: true,
            rank: true,
            awardedAt: true,
            pinnedOrder: true,
            game: { select: { title: true } },
            def: {
                select: {
                    name: true,
                    imageKey: true,
                    priority: true,
                },
            },
        },
    });
    const sorted = rows.sort((a, b) => {
        if (a.pinnedOrder != null || b.pinnedOrder != null) {
            return (a.pinnedOrder ?? Infinity) - (b.pinnedOrder ?? Infinity);
        }
        if (a.def.priority !== b.def.priority) {
            return a.def.priority - b.def.priority;
        }
        return a.awardedAt.getTime() - b.awardedAt.getTime();
    });
    return sorted.slice(0, options.limit ?? DISPLAY_LIMIT).map((row) => ({
        defId: row.defId,
        gameId: row.gameId,
        gameTitle: row.game.title,
        categoryKey: row.categoryKey,
        name: row.def.name,
        rank: row.rank,
        imageURL: toImageURL(row.def.imageKey),
        awardedAt: row.awardedAt,
    }));
}

/** 表示中のメッセージの投稿者ぶんをまとめて引く。1 件ずつ引かない */
export async function fetchTitlesForUsers(
    userIds: string[],
    gameId: number,
): Promise<Map<string, TitleBadge[]>> {
    const result = new Map<string, TitleBadge[]>();
    if (userIds.length === 0) {
        return result;
    }
    const rows = await prisma.scoreTitle.findMany({
        where: { userId: { in: [...new Set(userIds)] }, gameId },
        select: {
            userId: true,
            defId: true,
            gameId: true,
            categoryKey: true,
            rank: true,
            awardedAt: true,
            pinnedOrder: true,
            game: { select: { title: true } },
            def: {
                select: {
                    name: true,
                    imageKey: true,
                    priority: true,
                },
            },
        },
    });
    for (const row of rows) {
        const list = result.get(row.userId) ?? [];
        list.push({
            defId: row.defId,
            gameId: row.gameId,
            gameTitle: row.game.title,
            categoryKey: row.categoryKey,
            name: row.def.name,
            rank: row.rank,
            imageURL: toImageURL(row.def.imageKey),
            awardedAt: row.awardedAt,
        });
        result.set(row.userId, list);
    }
    for (const [userId, list] of result) {
        result.set(userId, list.slice(0, DISPLAY_LIMIT));
    }
    return result;
}

/**
 * WHY: 保存しているのは置き場の鍵だけ。配信元は設定で変わるので、読むときに
 * 組み立てる。
 */
function toImageURL(imageKey: string | null): string | undefined {
    return imageKey ? `${publicContentBaseUrl}/${imageKey}` : undefined;
}
