import { prisma } from "@multi-indiegame/persist-schema";
import {
    GameStats,
    ScoreEntry,
    ScoreSection,
    ScoreTotal,
    StatsPeriod,
} from "../types";
import {
    ScoreFieldSetting,
    ScoreboardFormatDefinition,
    fetchFormat,
    fieldSetting,
    playFieldSetting,
} from "@multi-indiegame/scoreboard-schema";
import { isShownOnStats } from "../share/score-value-type";
import { fetchMonthlyArchive, listArchivedMonths } from "./scoreboard-archive";

/** 直近としてさかのぼる日数。月初にランキングが空にならないようローリングで持つ */
const RECENT_DAYS = 30;
/** 1 つのランキングに載せる件数 */
const RANKING_LIMIT = 10;

/**
 * 主体 1 人分の集計。
 *
 * WHY: 歴代と直近で**同じ形**にする。引き方（投稿者の設定）はこの形にだけ
 * 当てるので、期間によって見え方が変わらない。歴代は増分更新済みの
 * `ScoreBest` から、直近は `ScoreValue` から作るが、出てくる形は同じ。
 */
interface SubjectAggregate {
    subjectKey: string;
    max: number | null;
    maxAt: Date | null;
    min: number | null;
    minAt: Date | null;
    sum: number;
    count: number;
    last: number | null;
    lastAt: Date | null;
    recordCount: number;
    trueCount: number;
}

export async function fetchGameStats(
    gameId: number,
    period: StatsPeriod,
    month?: string,
): Promise<GameStats> {
    if (period === "month") {
        return await fromArchive(gameId, month);
    }
    const format = await fetchFormat(gameId);
    const keys = await listKeys(gameId, period);
    const sections: ScoreSection[] = [];
    for (const key of keys) {
        const setting = fieldSetting(format, key);
        if (!isShownOnStats(setting)) {
            continue;
        }
        const section =
            setting.dedupe === "all"
                ? buildListSection(
                      key,
                      setting,
                      await loadTopEntries(gameId, key, period, setting),
                  )
                : buildSection(
                      key,
                      setting,
                      await loadAggregates(gameId, key, period),
                  );
        if (section) {
            sections.push(await withNames(section));
        }
    }
    return {
        gameId,
        period,
        months: await listArchivedMonths(gameId),
        playRankingChartHidden: !!format.playRanking.chartHidden,
        playRanking: format.playRanking.hidden
            ? []
            : await buildPlayRanking(gameId, period),
        sections,
        playRecords: await buildPlayRecords(gameId, period, format),
    };
}

/**
 * プレイ自体の記録を、投稿者が載せると決めたぶんだけ組み立てる。
 *
 * WHY: 主体がいないので順位は付かない。「このゲームで何回起きたか」を 1 行で出す。
 */
async function buildPlayRecords(
    gameId: number,
    period: StatsPeriod,
    format: ScoreboardFormatDefinition,
): Promise<ScoreTotal[]> {
    const totals = await loadPlayTotals(gameId, period);
    const records: ScoreTotal[] = [];
    for (const total of totals) {
        const setting = playFieldSetting(format, total.key);
        if (!isShownOnStats(setting)) {
            continue;
        }
        const record = toPlayRecord(total.key, total, setting);
        if (record) {
            records.push(record);
        }
    }
    return records;
}

function toPlayRecord(
    key: string,
    total: SubjectAggregate,
    setting: ScoreFieldSetting,
): ScoreTotal | null {
    const heading = setting.label ?? key;
    if (setting.aggregate === "rate") {
        // WHY: 主体ごとの達成率と同じく、true が 1 件も無いうちは出さない
        if (total.recordCount === 0 || total.trueCount === 0) {
            return null;
        }
        return {
            key,
            heading,
            rate: { achieved: total.trueCount, total: total.recordCount },
        };
    }
    const value = representative(total, setting);
    if (value == null) {
        return null;
    }
    return {
        key,
        heading,
        unit: setting.unit,
        value,
        at: setting.showTimestamp
            ? (representativeAt(total, setting) ?? undefined)
            : undefined,
    };
}

/** プレイ自体の記録の集計。歴代は積んだ表から、直近は生レコードから */
async function loadPlayTotals(
    gameId: number,
    period: StatsPeriod,
): Promise<(SubjectAggregate & { key: string })[]> {
    if (period === "all") {
        const rows = await prisma.scoreGameTotal.findMany({
            where: { gameId },
            orderBy: { key: "asc" },
        });
        return rows.map((row) => ({
            key: row.key,
            subjectKey: "",
            max: row.maxValue,
            maxAt: row.maxAt,
            min: row.minValue,
            minAt: row.minAt,
            sum: row.sum,
            count: row.count,
            last: row.lastValue,
            lastAt: row.lastAt,
            recordCount: row.recordCount,
            trueCount: row.trueCount,
        }));
    }
    const rows = await prisma.$queryRaw<
        {
            key: string;
            max: number | null;
            maxAt: Date | null;
            min: number | null;
            minAt: Date | null;
            sum: number | null;
            count: bigint;
            last: number | null;
            lastAt: Date | null;
            recordCount: bigint;
            trueCount: bigint;
        }[]
    >`
        SELECT
            v."key",
            max(v."numValue") AS "max",
            (array_agg(v."endedAt" ORDER BY v."numValue" DESC NULLS LAST, v."endedAt" ASC))[1] AS "maxAt",
            min(v."numValue") AS "min",
            (array_agg(v."endedAt" ORDER BY v."numValue" ASC NULLS LAST, v."endedAt" ASC))[1] AS "minAt",
            sum(v."numValue") AS "sum",
            count(v."numValue") AS "count",
            (array_agg(v."numValue" ORDER BY v."endedAt" DESC))[1] AS "last",
            max(v."endedAt") AS "lastAt",
            count(*) AS "recordCount",
            count(*) FILTER (WHERE v."boolValue" IS TRUE) AS "trueCount"
        FROM "ScoreValue" v
        JOIN "ScoreRecord" r ON r."id" = v."recordId"
        WHERE v."gameId" = ${gameId}
          AND r."playerId" IS NULL
          AND r."excluded" = false
          AND v."endedAt" >= ${since()}
        GROUP BY v."key"
        ORDER BY v."key" ASC
    `;
    return rows.map((row) => ({
        key: row.key,
        subjectKey: "",
        max: row.max,
        maxAt: row.maxAt,
        min: row.min,
        minAt: row.minAt,
        sum: row.sum ?? 0,
        count: Number(row.count),
        last: row.last,
        lastAt: row.lastAt,
        recordCount: Number(row.recordCount),
        trueCount: Number(row.trueCount),
    }));
}

async function listKeys(
    gameId: number,
    period: StatsPeriod,
): Promise<string[]> {
    if (period === "all") {
        // WHY: 複数ランクインのキーは主体ごとの集計を持たず、上位リストにしか
        // 現れない。片方だけを見るとそのキーが統計から消える
        const [aggregated, ranked] = await Promise.all([
            prisma.scoreBest.findMany({
                where: { gameId },
                distinct: ["key"],
                select: { key: true },
            }),
            prisma.scoreTopEntry.findMany({
                where: { gameId },
                distinct: ["key"],
                select: { key: true },
            }),
        ]);
        return [
            ...new Set([...aggregated, ...ranked].map((row) => row.key)),
        ].sort();
    }
    const rows = await prisma.scoreValue.findMany({
        where: { gameId, subjectKey: { not: null }, endedAt: { gte: since() } },
        distinct: ["key"],
        select: { key: true },
        orderBy: { key: "asc" },
    });
    return rows.map((row) => row.key);
}

/**
 * 歴代は増分更新済みの表から、直近は生レコードから、同じ形の集計を作る。
 *
 * WHY: 直近を 1 本の SQL にまとめているのは、最新値（`last`）が
 * `groupBy` では取れないため。`array_agg` で並べ替えてから先頭を採る。
 */
async function loadAggregates(
    gameId: number,
    key: string,
    period: StatsPeriod,
): Promise<SubjectAggregate[]> {
    if (period === "all") {
        const rows = await prisma.scoreBest.findMany({
            where: { gameId, key },
            select: {
                subjectKey: true,
                maxValue: true,
                maxAt: true,
                minValue: true,
                minAt: true,
                sum: true,
                count: true,
                lastValue: true,
                lastAt: true,
                recordCount: true,
                trueCount: true,
            },
        });
        return rows.map((row) => ({
            subjectKey: row.subjectKey,
            max: row.maxValue,
            maxAt: row.maxAt,
            min: row.minValue,
            minAt: row.minAt,
            sum: row.sum,
            count: row.count,
            last: row.lastValue,
            lastAt: row.lastAt,
            recordCount: row.recordCount,
            trueCount: row.trueCount,
        }));
    }
    const rows = await prisma.$queryRaw<
        {
            subjectKey: string;
            max: number | null;
            maxAt: Date | null;
            min: number | null;
            minAt: Date | null;
            sum: number | null;
            count: bigint;
            last: number | null;
            lastAt: Date | null;
            recordCount: bigint;
            trueCount: bigint;
        }[]
    >`
        SELECT
            "subjectKey",
            max("numValue") AS "max",
            (array_agg("endedAt" ORDER BY "numValue" DESC NULLS LAST, "endedAt" ASC))[1] AS "maxAt",
            min("numValue") AS "min",
            (array_agg("endedAt" ORDER BY "numValue" ASC NULLS LAST, "endedAt" ASC))[1] AS "minAt",
            sum("numValue") AS "sum",
            count("numValue") AS "count",
            (array_agg("numValue" ORDER BY "endedAt" DESC))[1] AS "last",
            max("endedAt") AS "lastAt",
            count(*) AS "recordCount",
            count(*) FILTER (WHERE "boolValue" IS TRUE) AS "trueCount"
        FROM "ScoreValue"
        WHERE "gameId" = ${gameId}
          AND "key" = ${key}
          AND "subjectKey" IS NOT NULL
          AND "endedAt" >= ${since()}
        GROUP BY "subjectKey"
    `;
    return rows.map((row) => ({
        subjectKey: row.subjectKey,
        max: row.max,
        maxAt: row.maxAt,
        min: row.min,
        minAt: row.minAt,
        sum: row.sum ?? 0,
        count: Number(row.count),
        last: row.last,
        lastAt: row.lastAt,
        recordCount: Number(row.recordCount),
        trueCount: Number(row.trueCount),
    }));
}

/** ランキングに 1 行として載る記録 */
interface RankedValue {
    subjectKey: string;
    value: number;
    at: Date;
}

/**
 * 複数ランクインを許すときの取り出し。
 *
 * WHY: 歴代は突き合わせのたびに積んでいる上位 N 件のリストから、直近は生レコード
 * から採る。どちらも「1 プレイ 1 件」の並びで、出てくる形は同じ。
 */
async function loadTopEntries(
    gameId: number,
    key: string,
    period: StatsPeriod,
    setting: ScoreFieldSetting,
): Promise<RankedValue[]> {
    const order = setting.direction === "high" ? "desc" : "asc";
    if (period === "all") {
        const rows = await prisma.scoreTopEntry.findMany({
            where: { gameId, key },
            orderBy: [{ value: order }, { endedAt: "asc" }],
            take: RANKING_LIMIT,
            select: { subjectKey: true, value: true, endedAt: true },
        });
        return rows.map((row) => ({
            subjectKey: row.subjectKey,
            value: row.value,
            at: row.endedAt,
        }));
    }
    const rows = await prisma.scoreValue.findMany({
        where: {
            gameId,
            key,
            subjectKey: { not: null },
            numValue: { not: null },
            endedAt: { gte: since() },
        },
        orderBy: [{ numValue: order }, { endedAt: "asc" }],
        take: RANKING_LIMIT,
        select: { subjectKey: true, numValue: true, endedAt: true },
    });
    return rows.map((row) => ({
        subjectKey: row.subjectKey!,
        value: row.numValue!,
        at: row.endedAt,
    }));
}

function buildListSection(
    key: string,
    setting: ScoreFieldSetting,
    rows: RankedValue[],
): ScoreSection | null {
    if (rows.length === 0) {
        return null;
    }
    return {
        key,
        heading: setting.label ?? key,
        unit: setting.unit,
        chartHidden: !!setting.chartHidden,
        kind: "ranking",
        entries: withTieRanks(
            rows.map((row, index) => ({
                rank: index + 1,
                name: row.subjectKey,
                value: row.value,
                at: setting.showTimestamp ? row.at : undefined,
            })),
        ),
    };
}

/**
 * 投稿者の設定を集計に当てて、1 つのセクションにする。
 *
 * **ここが唯一の引き方**で、歴代にも直近にも同じように当たる。
 */
function buildSection(
    key: string,
    setting: ScoreFieldSetting,
    aggregates: SubjectAggregate[],
): ScoreSection | null {
    const heading = setting.label ?? key;
    const numeric = aggregates
        .map((row) => ({ row, value: representative(row, setting) }))
        .filter(
            (item): item is { row: SubjectAggregate; value: number } =>
                item.value != null,
        );
    if (numeric.length > 0) {
        numeric.sort((a, b) =>
            setting.direction === "high"
                ? b.value - a.value
                : a.value - b.value,
        );
        // WHY: 数値の件数と、真偽値の達成回数は別物。回数で見るキーでは
        // 「数値の件数」は常に 0 になり、読み手に意味を持たない
        const numericCount = aggregates.reduce(
            (acc, row) => acc + row.count,
            0,
        );
        const byTrueCount =
            setting.valueType === "boolean" || numericCount === 0;
        const sum = aggregates.reduce((acc, row) => acc + row.sum, 0);
        return {
            key,
            heading,
            unit: setting.unit,
            kind: "ranking",
            entries: withTieRanks(
                numeric.slice(0, RANKING_LIMIT).map((item, index) => ({
                    rank: index + 1,
                    name: item.row.subjectKey,
                    value: item.value,
                    at: setting.showTimestamp
                        ? (representativeAt(item.row, setting) ?? undefined)
                        : undefined,
                })),
            ),
            chartHidden: !!setting.chartHidden,
            summary: {
                // WHY: 順位は「何人の中での順位か」で意味が変わる。母数を添える
                subjects: numeric.length,
                // WHY: 平均は数値の記録にだけ意味がある。回数や真偽値では出さない
                average:
                    !byTrueCount && numericCount > 0
                        ? sum / numericCount
                        : undefined,
            },
        };
    }
    const total = aggregates.reduce((acc, row) => acc + row.recordCount, 0);
    const achieved = aggregates.reduce((acc, row) => acc + row.trueCount, 0);
    if (setting.aggregate === "rate" && total > 0 && achieved > 0) {
        return {
            key,
            heading,
            chartHidden: !!setting.chartHidden,
            kind: "rate",
            entries: [],
            rate: { achieved, total },
        };
    }
    // WHY: string は出さない。投稿者がラベルを定めるまで、コンテンツが申告した
    // 文字列をそのまま公開ページに載せることになるため
    return null;
}

function representative(
    row: SubjectAggregate,
    setting: ScoreFieldSetting,
): number | null {
    switch (setting.aggregate) {
        case "best":
            return setting.direction === "high" ? row.max : row.min;
        case "latest":
            return row.last;
        case "sum":
            return row.count > 0 ? row.sum : null;
        case "count":
            // WHY: 種類が混在したキーは、投稿者が選んだ種類の値だけを数える
            if (setting.valueType === "boolean") {
                return row.trueCount > 0 ? row.trueCount : null;
            }
            if (row.count > 0 || setting.valueType === "number") {
                return row.count > 0 ? row.count : null;
            }
            // WHY: 数値を持たないキーでは、達成した回数を「回数」とみなす。
            // boolean は false も記録されるので、件数で数えると達成しなかった
            // 回まで含んでしまう。true の回数が意図に合う
            return row.trueCount > 0 ? row.trueCount : null;
        case "rate":
            return null;
    }
}

function representativeAt(
    row: SubjectAggregate,
    setting: ScoreFieldSetting,
): Date | null {
    switch (setting.aggregate) {
        case "best":
            return setting.direction === "high" ? row.maxAt : row.minAt;
        default:
            return row.lastAt;
    }
}

async function buildPlayRanking(
    gameId: number,
    period: StatsPeriod,
): Promise<ScoreEntry[]> {
    const rows =
        period === "all"
            ? (
                  await prisma.scorePlayCount.findMany({
                      where: { gameId },
                      orderBy: [{ count: "desc" }, { lastPlayedAt: "asc" }],
                      take: RANKING_LIMIT,
                      select: {
                          subjectKey: true,
                          count: true,
                          lastPlayedAt: true,
                      },
                  })
              ).map((row) => ({
                  subjectKey: row.subjectKey,
                  value: row.count,
                  at: row.lastPlayedAt,
              }))
            : (
                  await prisma.scoreRecord.groupBy({
                      by: ["subjectKey"],
                      where: {
                          gameId,
                          // WHY: 歴代（ScorePlayCount）と揃え、サインイン
                          // 利用者だけ数える
                          subjectKey: { startsWith: "u:" },
                          endedAt: { gte: since() },
                      },
                      _count: { _all: true },
                      _max: { endedAt: true },
                  })
              )
                  .map((row) => ({
                      subjectKey: row.subjectKey!,
                      value: row._count._all,
                      at: row._max.endedAt ?? undefined,
                  }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, RANKING_LIMIT);
    return resolveNames(
        withTieRanks(
            rows.map((row, index) => ({
                rank: index + 1,
                name: row.subjectKey,
                value: row.value,
                at: row.at ?? undefined,
            })),
        ),
    );
}

async function withNames(section: ScoreSection): Promise<ScoreSection> {
    return { ...section, entries: await resolveNames(section.entries) };
}

/**
 * 主体の鍵を表示名に解決する。
 *
 * WHY: サインイン利用者の名前は控えず、そのつど `User` から引く。改名や退会が
 * ランキングにも自動で反映される。引けない相手は退会したものとして扱う。
 */
async function resolveNames(entries: ScoreEntry[]): Promise<ScoreEntry[]> {
    if (entries.length === 0) {
        return [];
    }
    const subjects = await prisma.scoreSubject.findMany({
        where: { subjectKey: { in: entries.map((entry) => entry.name) } },
        select: { subjectKey: true, userId: true, guestName: true },
    });
    const userIds = subjects
        .map((subject) => subject.userId)
        .filter((id): id is string => !!id);
    const users = userIds.length
        ? await prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true, image: true },
          })
        : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    const bySubject = new Map(
        subjects.map((subject) => [subject.subjectKey, subject]),
    );
    return entries.map((entry) => {
        const subject = bySubject.get(entry.name);
        const user = subject?.userId ? userById.get(subject.userId) : undefined;
        return {
            ...entry,
            name: user?.name ?? subject?.guestName ?? "退会したユーザー",
            userId: user?.id,
            iconURL: user?.image ?? undefined,
        };
    });
}

function since(): Date {
    return new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
}

export type { ScoreboardFormatDefinition };

/**
 * 閉じた月は、凍結した集計から組み立てる。
 *
 * WHY: **引き方は歴代・直近と同じ関数を通す。** データの出どころが変わっても、
 * 投稿者の設定の当たり方は変えない。違うのは「当時のフォーマット」で固定される
 * ことだけ。
 */
async function fromArchive(
    gameId: number,
    month: string | undefined,
): Promise<GameStats> {
    const months = await listArchivedMonths(gameId);
    const empty: GameStats = {
        gameId,
        period: "month",
        month,
        months,
        playRankingChartHidden: false,
        playRanking: [],
        sections: [],
        playRecords: [],
    };
    if (!month) {
        return empty;
    }
    const archive = await fetchMonthlyArchive(gameId, month);
    if (!archive) {
        return empty;
    }
    const sections: ScoreSection[] = [];
    for (const archived of archive.keys) {
        const setting = fieldSetting(archive.format, archived.key);
        if (!isShownOnStats(setting)) {
            continue;
        }
        const section =
            setting.dedupe === "all"
                ? buildListSection(
                      archived.key,
                      setting,
                      sortEntries(archived.entries ?? [], setting).slice(
                          0,
                          RANKING_LIMIT,
                      ),
                  )
                : buildSection(
                      archived.key,
                      setting,
                      archived.subjects.map((subject) => ({
                          subjectKey: subject.subjectKey,
                          max: subject.max,
                          maxAt: null,
                          min: subject.min,
                          minAt: null,
                          sum: subject.sum,
                          count: subject.count,
                          last: subject.last,
                          lastAt: null,
                          recordCount: subject.recordCount,
                          trueCount: subject.trueCount,
                      })),
                  );
        if (section) {
            sections.push(await withNames(section));
        }
    }
    const playRanking = archive.format.playRanking.hidden
        ? []
        : await resolveNames(
              withTieRanks(
                  [...archive.playCounts]
                      .sort((a, b) => b.count - a.count)
                      .slice(0, RANKING_LIMIT)
                      .map((row, index) => ({
                          rank: index + 1,
                          name: row.subjectKey,
                          value: row.count,
                      })),
              ),
          );
    const playRecords: ScoreTotal[] = [];
    for (const total of archive.playTotals ?? []) {
        const setting = playFieldSetting(archive.format, total.key);
        if (!isShownOnStats(setting)) {
            continue;
        }
        const record = toPlayRecord(
            total.key,
            {
                subjectKey: "",
                max: total.max,
                maxAt: null,
                min: total.min,
                minAt: null,
                sum: total.sum,
                count: total.count,
                last: total.last,
                lastAt: null,
                recordCount: total.recordCount,
                trueCount: total.trueCount,
            },
            setting,
        );
        if (record) {
            playRecords.push(record);
        }
    }
    return {
        gameId,
        period: "month",
        month,
        months,
        playRankingChartHidden: !!archive.format.playRanking.chartHidden,
        formatVersion: archive.formatVersion,
        playRanking,
        sections,
        playRecords,
    };
}

function sortEntries(
    entries: { subjectKey: string; value: number; at: string }[],
    setting: ScoreFieldSetting,
): RankedValue[] {
    return [...entries]
        .map((entry) => ({
            subjectKey: entry.subjectKey,
            value: entry.value,
            at: new Date(entry.at),
        }))
        .sort((a, b) =>
            setting.direction === "high"
                ? b.value - a.value || a.at.getTime() - b.at.getTime()
                : a.value - b.value || a.at.getTime() - b.at.getTime(),
        );
}

/**
 * 同じ値には同じ順位を振る。
 *
 * WHY: 並べ替えた順に 1, 2, 3 と振ると、同じ値なのに上下があるように見える。
 * 次の順位は並んだ人数ぶん飛ばす（1, 1, 3）。
 */
function withTieRanks(entries: ScoreEntry[]): ScoreEntry[] {
    let rank = 0;
    let previous: number | null = null;
    return entries.map((entry, index) => {
        if (previous == null || entry.value !== previous) {
            rank = index + 1;
            previous = entry.value;
        }
        return { ...entry, rank };
    });
}
