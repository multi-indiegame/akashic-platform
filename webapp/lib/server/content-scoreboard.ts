import { prisma } from "@multi-indiegame/persist-schema";

const SCOREBOARD_EXTERNAL = "scoreboard";

/**
 * Content の select に混ぜ、{@link hasScoreboard} で scoreboard を宣言しているかを判定する
 */
export const scoreboardCountSelect = {
    _count: {
        select: {
            externals: { where: { name: SCOREBOARD_EXTERNAL } },
        },
    },
} as const;

export function hasScoreboard(content: { _count: { externals: number } }) {
    return content._count.externals > 0;
}

export async function fetchHasScoreboard(contentId: number) {
    return (
        (await prisma.contentExternal.count({
            where: { contentId, name: SCOREBOARD_EXTERNAL },
        })) > 0
    );
}
