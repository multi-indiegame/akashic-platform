import {
    GetObjectCommand,
    NoSuchKey,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import { prisma } from "@multi-indiegame/persist-schema";
import {
    ScoreboardFormatDefinition,
    fetchFormatAt,
} from "@multi-indiegame/scoreboard-schema";
import { getS3Client } from "./content-utils";
import { logSafe } from "./log-safe";

/**
 * 閉じた月の集計を凍結して置いておく。
 *
 * WHY: 生成は**その月のページが初めて開かれたとき**。 次からは S3 を返す。
 *
 * WHY: 凍結するのは集計済みの値と主体の鍵だけで、**表示名は入れない**。
 * 改名・退会・掲載の取りやめが、過去の月にも効くようにするため。
 */

const PREFIX = "scoreboard-archive";

/**
 * WHY: 公開しているコンテンツ配信用のバケットには置かない。凍結した JSON は
 * 掲載の絞り込み（投稿者が隠したキー、上位 10 件、日時を出すかどうか）を
 * 通す前の中身で、主体の鍵もそのまま持っている。**置き場所が公開されていると、
 * 鍵が `scoreboard-archive/<gameId>/<YYYY-MM>.json` と割り出せる以上、
 * 絞り込みを飛び越えて読めてしまう。** 読み出しはサーバー側からしか行わないので、
 * 公開配信する必要もない。
 */
function getArchiveBucket() {
    if (!process.env.S3_ARCHIVE_BUCKET) {
        throw new Error("S3_ARCHIVE_BUCKET is required.");
    }
    return process.env.S3_ARCHIVE_BUCKET;
}

const archiveKeyPrefix = process.env.S3_ARCHIVE_KEY_PREFIX ?? "";

/** 1 つのキーの集計。月の中での最大・最小・最後の値と、その日時 */
export interface ArchivedAggregate {
    max: number | null;
    min: number | null;
    sum: number;
    count: number;
    last: number | null;
    recordCount: number;
    trueCount: number;
    /**
     * 日時（ISO 8601）。日時を出す設定のときに使う。持つ前に凍結した分には無い
     */
    maxAt?: string | null;
    minAt?: string | null;
    lastAt?: string | null;
}

/** 主体ごとの集計。全損したときに歴代を組み直す材料でもある */
export interface ArchivedSubject extends ArchivedAggregate {
    subjectKey: string;
}

export interface ArchivedKey {
    key: string;
    subjects: ArchivedSubject[];
    /** 複数ランクインの設定のときに使う、1 プレイ 1 件の並び */
    entries?: { subjectKey: string; value: number; at: string }[];
}

/** プレイ自体の記録。主体がいないのでキーごとに 1 件 */
export interface ArchivedPlayTotal extends ArchivedAggregate {
    key: string;
}

export interface MonthlyArchive {
    gameId: number;
    month: string;
    formatVersion: number;
    format: ScoreboardFormatDefinition;
    /**
     * 凍結した日時（ISO 8601）。これより後に作り直された主体は、掲載を取りやめる
     * 前の記録の持ち主とみなして伏せる
     */
    builtAt: string;
    playCounts: { subjectKey: string; count: number }[];
    keys: ArchivedKey[];
    /** 投稿者の設定で出すかが決まる。凍結の時点では絞らない */
    playTotals?: ArchivedPlayTotal[];
}

/** `YYYY-MM` として妥当か */
export function isValidMonth(month: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/** その月がもう閉じているか。閉じていない月は凍結しない */
export function isClosedMonth(month: string, now = new Date()): boolean {
    return month < toMonth(now);
}

export function toMonth(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string): { from: Date; to: Date } {
    const [year, mon] = month.split("-").map(Number);
    return {
        from: new Date(Date.UTC(year, mon - 1, 1)),
        to: new Date(Date.UTC(year, mon, 1)),
    };
}

/**
 * その月のアーカイブを返す。無ければ作る。
 *
 * 閉じていない月は凍結できないので null を返す（呼び出し側が生レコードから出す）。
 */
export async function fetchMonthlyArchive(
    gameId: number,
    month: string,
): Promise<MonthlyArchive | null> {
    if (!isValidMonth(month) || !isClosedMonth(month)) {
        return null;
    }
    const existing = await prisma.scoreboardArchive.findUnique({
        where: { gameId_month: { gameId, month } },
        select: { s3Key: true, createdAt: true },
    });
    if (!existing) {
        return await buildArchive(gameId, month);
    }
    const stored = await readArchive(existing.s3Key);
    if (stored && stored !== "missing") {
        // WHY: builtAt を持つ前に凍結した分は、台帳を作った日時で代える。
        // 凍結と同じ処理の中で作っているので、ずれは書き込みにかかる時間だけ
        return {
            ...stored,
            builtAt: stored.builtAt ?? existing.createdAt.toISOString(),
        };
    }
    // WHY: 一時的に読めなかっただけなら作り直さない。凍結後に反映された記録や
    // 掲載の取りやめが混ざった内容で、凍結済みの中身を上書きしてしまう
    if (stored !== "missing") {
        return null;
    }
    const built = await buildArchive(gameId, month);
    if (!built) {
        // WHY: S3 の実体がライフサイクルポリシーで先に消えうる
        await prisma.scoreboardArchive.deleteMany({
            where: { gameId, month },
        });
    }
    return built;
}

async function buildArchive(
    gameId: number,
    month: string,
): Promise<MonthlyArchive | null> {
    const { from, to } = monthRange(month);
    // WHY: 値を読む前の時点にする。読んでいる最中に作り直された主体も伏せる側に倒す
    const builtAt = new Date().toISOString();
    // WHY: その月の終わりに有効だった版で固める。あとで投稿者が設定を変えても、
    // 過去の月の見え方は変わらない
    const format = await fetchFormatAt(gameId, to);
    const values = await prisma.scoreValue.findMany({
        where: {
            gameId,
            subjectKey: { not: null },
            endedAt: { gte: from, lt: to },
        },
        select: {
            key: true,
            subjectKey: true,
            numValue: true,
            boolValue: true,
            endedAt: true,
        },
        // WHY: 後から読んだ値を「最後の値」とするので、終わった順に並べる
        orderBy: [{ endedAt: "asc" }, { id: "asc" }],
    });
    const byKey = new Map<string, Map<string, ArchivedSubject>>();
    const entries = new Map<
        string,
        { subjectKey: string; value: number; at: string }[]
    >();
    for (const value of values) {
        const subjectKey = value.subjectKey!;
        const subjects = byKey.get(value.key) ?? new Map();
        byKey.set(value.key, subjects);
        const subject = subjects.get(subjectKey) ?? {
            subjectKey,
            ...emptyAggregate(),
        };
        accumulate(subject, value);
        if (value.numValue != null) {
            const list = entries.get(value.key) ?? [];
            list.push({
                subjectKey,
                value: value.numValue,
                at: value.endedAt.toISOString(),
            });
            entries.set(value.key, list);
        }
        subjects.set(subjectKey, subject);
    }
    // WHY: プレイ自体の記録も同じ月に凍結する。生レコードが消えたあとでも、
    // 月別の表示が組み立てられるようにする
    const playValues = await prisma.scoreValue.findMany({
        where: {
            gameId,
            endedAt: { gte: from, lt: to },
            record: { playerId: null, excluded: false },
        },
        select: { key: true, numValue: true, boolValue: true, endedAt: true },
        orderBy: [{ endedAt: "asc" }, { id: "asc" }],
    });
    if (values.length === 0 && playValues.length === 0) {
        return null;
    }
    const playTotals = new Map<string, ArchivedPlayTotal>();
    for (const value of playValues) {
        const total = playTotals.get(value.key) ?? {
            key: value.key,
            ...emptyAggregate(),
        };
        accumulate(total, value);
        playTotals.set(value.key, total);
    }
    const playCounts = await prisma.scoreRecord.groupBy({
        by: ["subjectKey"],
        where: {
            gameId,
            // WHY: 歴代（ScorePlayCount）と揃え、サインイン利用者だけ数える
            subjectKey: { startsWith: "u:" },
            endedAt: { gte: from, lt: to },
        },
        _count: { _all: true },
    });
    const archive: MonthlyArchive = {
        gameId,
        month,
        formatVersion: format.version,
        format,
        builtAt,
        playCounts: playCounts.map((row) => ({
            subjectKey: row.subjectKey!,
            count: row._count._all,
        })),
        keys: [...byKey.entries()].map(([key, subjects]) => ({
            key,
            subjects: [...subjects.values()],
            entries: entries.get(key),
        })),
        playTotals: [...playTotals.values()],
    };
    await writeArchive(gameId, month, format.version, archive);
    return archive;
}

function emptyAggregate(): ArchivedAggregate {
    return {
        max: null,
        min: null,
        sum: 0,
        count: 0,
        last: null,
        recordCount: 0,
        trueCount: 0,
        maxAt: null,
        minAt: null,
        lastAt: null,
    };
}

/**
 * 終わった順に 1 件ずつ積む。
 *
 * WHY: 最大・最小が同じ値のときは先に達成したほうの日時を残す。歴代と揃える
 */
function accumulate(
    aggregate: ArchivedAggregate,
    value: {
        numValue: number | null;
        boolValue: boolean | null;
        endedAt: Date;
    },
): void {
    const at = value.endedAt.toISOString();
    aggregate.recordCount++;
    aggregate.lastAt = at;
    if (value.boolValue === true) {
        aggregate.trueCount++;
    }
    const num = value.numValue;
    if (num == null) {
        return;
    }
    aggregate.count++;
    aggregate.sum += num;
    if (aggregate.max == null || num > aggregate.max) {
        aggregate.max = num;
        aggregate.maxAt = at;
    }
    if (aggregate.min == null || num < aggregate.min) {
        aggregate.min = num;
        aggregate.minAt = at;
    }
    aggregate.last = num;
}

function toKey(gameId: number, month: string): string {
    return `${PREFIX}/${gameId}/${month}.json`;
}

async function writeArchive(
    gameId: number,
    month: string,
    formatVersion: number,
    archive: MonthlyArchive,
): Promise<void> {
    const key = toKey(gameId, month);
    try {
        await getS3Client().send(
            new PutObjectCommand({
                Bucket: getArchiveBucket(),
                Key: `${archiveKeyPrefix}${key}`,
                Body: JSON.stringify(archive),
                ContentType: "application/json",
            }),
        );
        await prisma.scoreboardArchive.upsert({
            where: { gameId_month: { gameId, month } },
            create: { gameId, month, formatVersion, s3Key: key },
            update: { formatVersion, s3Key: key },
        });
    } catch (err) {
        // WHY: 凍結できなくても表示はできる（その場で組み立てた結果を返す）。
        // 次に開かれたときに作り直せばよい
        console.warn(
            "failed to write scoreboard archive (gameId = %s, month = %s)",
            logSafe(gameId),
            logSafe(month),
            err,
        );
    }
}

async function readArchive(
    key: string,
): Promise<MonthlyArchive | "missing" | null> {
    try {
        const res = await getS3Client().send(
            new GetObjectCommand({
                Bucket: getArchiveBucket(),
                Key: `${archiveKeyPrefix}${key}`,
            }),
        );
        const body = await res.Body?.transformToString();
        return body ? (JSON.parse(body) as MonthlyArchive) : null;
    } catch (err) {
        if (err instanceof NoSuchKey) {
            return "missing";
        }
        console.warn(
            "failed to read scoreboard archive (key = %s)",
            logSafe(key),
            err,
        );
        return null;
    }
}

/**
 * 統計ページに出す、選べる月の一覧
 *
 * WHY: 凍結はその月が開かれたときに行う。凍結済みの月だけを並べると、まだ
 * 凍結していない月へたどり着けず、いつまでも凍結されない。生レコードが残る
 * 閉じた月も並べる
 */
export async function listArchivedMonths(gameId: number): Promise<string[]> {
    const [archived, raw] = await Promise.all([
        prisma.scoreboardArchive.findMany({
            where: { gameId },
            select: { month: true },
        }),
        prisma.$queryRaw<{ month: string }[]>`
            SELECT DISTINCT to_char("endedAt", 'YYYY-MM') AS "month"
            FROM "ScoreRecord"
            WHERE "gameId" = ${gameId}
              AND "endedAt" < ${monthRange(toMonth(new Date())).from}
        `,
    ]);
    return [...new Set([...archived, ...raw].map((row) => row.month))].sort(
        (a, b) => b.localeCompare(a),
    );
}
