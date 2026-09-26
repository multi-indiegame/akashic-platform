import { Prisma, prisma } from "@multi-indiegame/persist-schema";
import { publicContentBaseUrl } from "./akashic";
import { fetchFormat, fieldSetting } from "@multi-indiegame/scoreboard-schema";
import { MyGameStats, MyScoreboard, MyScoreRecord } from "../types";
import { isShownOnStats } from "../share/score-value-type";
import { fetchTitles } from "./scoreboard-title";

/** 一覧に並べるゲームの数 */
const GAME_LIMIT = 20;

/**
 * マイページに出す統計。
 *
 * 用途が 2 つあるので、出すものも 2 つに分ける。
 * - **自分のプレイ傾向**: どのゲームをどれだけ遊んだか
 * - **各コンテンツでの立ち位置**: 投稿者が定めた指標で自分がどこにいるか
 *
 * WHY: 扱うのは掲載用に入っている記録だけ。名前を出す同意をした分に限られる。
 */
export async function fetchMyScoreboard(userId: string): Promise<MyScoreboard> {
    const subjectKey = `u:${userId}`;
    const plays = await prisma.scorePlayCount.findMany({
        where: { subjectKey },
        orderBy: [{ count: "desc" }, { lastPlayedAt: "desc" }],
        take: GAME_LIMIT,
        select: {
            gameId: true,
            count: true,
            lastPlayedAt: true,
            game: {
                select: {
                    title: true,
                    publisher: {
                        select: { id: true, name: true, image: true },
                    },
                    versions: {
                        take: 1,
                        orderBy: { id: "desc" },
                        select: { id: true, icon: true },
                    },
                },
            },
        },
    });
    const roomCounts = await countRooms(userId);
    const games: MyGameStats[] = [];
    for (const play of plays) {
        const version = play.game.versions[0];
        games.push({
            gameId: play.gameId,
            title: play.game.title,
            iconURL: version
                ? `${publicContentBaseUrl}/${version.id}/${version.icon}`
                : undefined,
            publisher: {
                id: play.game.publisher.id,
                name: play.game.publisher.name ?? "",
                image: play.game.publisher.image ?? undefined,
            },
            playCount: play.count,
            roomCount: roomCounts.get(play.gameId) ?? 0,
            lastPlayedAt: play.lastPlayedAt,
            records: await fetchMyRecords(play.gameId, subjectKey),
        });
    }
    return {
        games,
        titles: await fetchTitles(userId, { limit: 100 }),
    };
}

/**
 * 部屋を作った回数。
 *
 * WHY: スコア側に持たない。`Play` に部屋主が残っているので、そこから数えれば
 * 二重に持たずに済む。
 */
async function countRooms(userId: string): Promise<Map<number, number>> {
    const rows = await prisma.play.findMany({
        where: { gmUserId: userId },
        select: { content: { select: { gameId: true } } },
    });
    const counts = new Map<number, number>();
    for (const row of rows) {
        const gameId = row.content.gameId;
        counts.set(gameId, (counts.get(gameId) ?? 0) + 1);
    }
    return counts;
}

/**
 * そのゲームでの自己ベストと順位。
 */
async function fetchMyRecords(
    gameId: number,
    subjectKey: string,
): Promise<MyScoreRecord[]> {
    const format = await fetchFormat(gameId);
    const bests = await prisma.scoreBest.findMany({
        where: { gameId, subjectKey },
        select: {
            key: true,
            maxValue: true,
            maxAt: true,
            minValue: true,
            minAt: true,
            lastValue: true,
            lastAt: true,
            sum: true,
            count: true,
            trueCount: true,
        },
    });
    const records: MyScoreRecord[] = [];
    for (const best of bests) {
        const setting = fieldSetting(format, best.key);
        if (!isShownOnStats(setting)) {
            continue;
        }
        const value = representative(best, setting);
        if (value == null) {
            continue;
        }
        const column = rankColumn(best, setting);
        const [above, total] = await Promise.all([
            prisma.scoreBest.count({
                where: {
                    gameId,
                    key: best.key,
                    ...column.present,
                    [column.name]:
                        setting.direction === "high"
                            ? { gt: value }
                            : { lt: value },
                },
            }),
            prisma.scoreBest.count({
                where: { gameId, key: best.key, ...column.present },
            }),
        ]);
        records.push({
            key: best.key,
            heading: setting.label ?? best.key,
            unit: setting.unit,
            value,
            rank: above + 1,
            total,
            at: setting.showTimestamp
                ? (representativeAt(best, setting) ?? undefined)
                : undefined,
        });
    }
    return records;
}

type BestRow = {
    maxValue: number | null;
    maxAt: Date | null;
    minValue: number | null;
    minAt: Date | null;
    lastValue: number | null;
    lastAt: Date | null;
    sum: number;
    count: number;
    trueCount: number;
};

function representative(
    row: BestRow,
    setting: ReturnType<typeof fieldSetting>,
): number | null {
    switch (setting.aggregate) {
        case "best":
            return setting.direction === "high" ? row.maxValue : row.minValue;
        case "latest":
            return row.lastValue;
        case "sum":
            return row.count > 0 ? row.sum : null;
        case "count":
            if (ranksByTrueCount(row, setting)) {
                return row.trueCount > 0 ? row.trueCount : null;
            }
            return row.count > 0 ? row.count : null;
        case "rate":
            return null;
    }
}

/**
 * 順位を数える列と、順位に数える行の条件。
 *
 * WHY: 統計ページと同じ代表値で比べる。表示している値と別の列で数えると、
 * 見えている値と順位が食い違う
 */
function rankColumn(
    row: BestRow,
    setting: ReturnType<typeof fieldSetting>,
): {
    name: "maxValue" | "minValue" | "lastValue" | "sum" | "count" | "trueCount";
    present: Prisma.ScoreBestWhereInput;
} {
    switch (setting.aggregate) {
        case "latest":
            return { name: "lastValue", present: { lastValue: { not: null } } };
        case "sum":
            return { name: "sum", present: { count: { gt: 0 } } };
        case "count":
            return ranksByTrueCount(row, setting)
                ? { name: "trueCount", present: { trueCount: { gt: 0 } } }
                : { name: "count", present: { count: { gt: 0 } } };
        default:
            return setting.direction === "high"
                ? { name: "maxValue", present: { maxValue: { not: null } } }
                : { name: "minValue", present: { minValue: { not: null } } };
    }
}

/** 回数で見るキーか。順位の数え方が最良値のときと違う */
function ranksByTrueCount(
    row: BestRow,
    setting: ReturnType<typeof fieldSetting>,
): boolean {
    if (setting.aggregate !== "count") {
        return false;
    }
    // WHY: 種類が混在したキーは、投稿者が選んだ種類の値だけを数える。
    // 選んでいなければ、数値を持たないキーで達成した回数を「回数」とみなす
    if (setting.valueType) {
        return setting.valueType === "boolean";
    }
    return row.count === 0;
}

function representativeAt(
    row: BestRow,
    setting: ReturnType<typeof fieldSetting>,
): Date | null {
    switch (setting.aggregate) {
        case "best":
            return setting.direction === "high" ? row.maxAt : row.minAt;
        default:
            return row.lastAt;
    }
}
