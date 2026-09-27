import { prisma } from "@multi-indiegame/persist-schema";

export interface KeyCounts {
    key: string;
    _count: {
        _all: number;
        numValue: number;
        strValue: number;
        boolValue: number;
    };
}

/**
 * 記録が登録されたキーと、値の種類ごとの数。編集画面の候補に使う。
 *
 * WHY: 生レコードだけでなく歴代の集計にあるキーも拾う。生レコードは保持期間で
 * 消えるが、歴代の集計は統計に出続ける。拾わないと、出ているのに見せ方を
 * 変えられないキーが残る。
 *
 * WHY: 生レコードがあるキーはその数を使う。歴代の集計では数値以外の記録が
 * 文字列か真偽値かを数え分けられないので、true が出たかどうかで寄せる。
 */
export async function fetchKeyCounts(
    gameId: number,
    forPlayRecord: boolean,
): Promise<KeyCounts[]> {
    const [raw, retained] = await Promise.all([
        prisma.scoreValue.groupBy({
            by: ["key"],
            where: {
                gameId,
                record: { playerId: forPlayRecord ? null : { not: null } },
            },
            _count: {
                _all: true,
                numValue: true,
                strValue: true,
                boolValue: true,
            },
            orderBy: { key: "asc" },
        }),
        forPlayRecord
            ? fetchRetainedPlayCounts(gameId)
            : fetchRetainedCounts(gameId),
    ]);
    const reported = new Set(raw.map((row) => row.key));
    return [...raw, ...retained.filter((row) => !reported.has(row.key))].sort(
        (a, b) => (a.key < b.key ? -1 : 1),
    );
}

async function fetchRetainedCounts(gameId: number): Promise<KeyCounts[]> {
    const [bests, entries] = await Promise.all([
        prisma.scoreBest.groupBy({
            by: ["key"],
            where: { gameId },
            _sum: { count: true, recordCount: true, trueCount: true },
            _count: { lastBool: true },
        }),
        prisma.scoreTopEntry.groupBy({
            by: ["key"],
            where: { gameId },
            _count: { _all: true },
        }),
    ]);
    const rows = bests.map((row) =>
        toKeyCounts(row.key, {
            count: row._sum.count ?? 0,
            recordCount: row._sum.recordCount ?? 0,
            boolean: (row._sum.trueCount ?? 0) > 0 || row._count.lastBool > 0,
        }),
    );
    const aggregated = new Set(rows.map((row) => row.key));
    for (const entry of entries) {
        if (aggregated.has(entry.key)) {
            continue;
        }
        rows.push(
            toKeyCounts(entry.key, {
                count: entry._count._all,
                recordCount: entry._count._all,
                boolean: false,
            }),
        );
    }
    return rows;
}

async function fetchRetainedPlayCounts(gameId: number): Promise<KeyCounts[]> {
    const totals = await prisma.scoreGameTotal.findMany({
        where: { gameId },
        select: {
            key: true,
            count: true,
            recordCount: true,
            trueCount: true,
            lastBool: true,
        },
    });
    return totals.map((row) =>
        toKeyCounts(row.key, {
            count: row.count,
            recordCount: row.recordCount,
            boolean: row.trueCount > 0 || row.lastBool != null,
        }),
    );
}

function toKeyCounts(
    key: string,
    aggregate: { count: number; recordCount: number; boolean: boolean },
): KeyCounts {
    const others = Math.max(aggregate.recordCount - aggregate.count, 0);
    return {
        key,
        _count: {
            _all: aggregate.recordCount,
            numValue: aggregate.count,
            strValue: aggregate.boolean ? 0 : others,
            boolValue: aggregate.boolean ? others : 0,
        },
    };
}
