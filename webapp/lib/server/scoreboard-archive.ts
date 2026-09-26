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

/** 主体ごとの集計。全損したときに歴代を組み直す材料でもある */
export interface ArchivedSubject {
    subjectKey: string;
    max: number | null;
    min: number | null;
    sum: number;
    count: number;
    last: number | null;
    recordCount: number;
    trueCount: number;
}

export interface ArchivedKey {
    key: string;
    subjects: ArchivedSubject[];
    /** 複数ランクインの設定のときに使う、1 プレイ 1 件の並び */
    entries?: { subjectKey: string; value: number; at: string }[];
}

/** プレイ自体の記録。主体がいないのでキーごとに 1 件 */
export interface ArchivedPlayTotal {
    key: string;
    max: number | null;
    min: number | null;
    sum: number;
    count: number;
    last: number | null;
    recordCount: number;
    trueCount: number;
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
    const built = await buildArchive(gameId, month);
    if (!built && stored === "missing") {
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
    });
    if (values.length === 0) {
        return null;
    }
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
            max: null,
            min: null,
            sum: 0,
            count: 0,
            last: null,
            recordCount: 0,
            trueCount: 0,
        };
        subject.recordCount++;
        if (value.boolValue === true) {
            subject.trueCount++;
        }
        if (value.numValue != null) {
            subject.count++;
            subject.sum += value.numValue;
            subject.max =
                subject.max == null
                    ? value.numValue
                    : Math.max(subject.max, value.numValue);
            subject.min =
                subject.min == null
                    ? value.numValue
                    : Math.min(subject.min, value.numValue);
            subject.last = value.numValue;
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
        select: { key: true, numValue: true, boolValue: true },
    });
    const playTotals = new Map<string, ArchivedPlayTotal>();
    for (const value of playValues) {
        const total = playTotals.get(value.key) ?? {
            key: value.key,
            max: null,
            min: null,
            sum: 0,
            count: 0,
            last: null,
            recordCount: 0,
            trueCount: 0,
        };
        total.recordCount++;
        if (value.boolValue === true) {
            total.trueCount++;
        }
        if (value.numValue != null) {
            total.count++;
            total.sum += value.numValue;
            total.max =
                total.max == null
                    ? value.numValue
                    : Math.max(total.max, value.numValue);
            total.min =
                total.min == null
                    ? value.numValue
                    : Math.min(total.min, value.numValue);
            total.last = value.numValue;
        }
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

/** 統計ページに出す、選べる月の一覧 */
export async function listArchivedMonths(gameId: number): Promise<string[]> {
    const rows = await prisma.scoreboardArchive.findMany({
        where: { gameId },
        orderBy: { month: "desc" },
        select: { month: true },
    });
    return rows.map((row) => row.month);
}
