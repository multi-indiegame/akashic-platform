import { type Prisma, prisma } from "@multi-indiegame/persist-schema";
import type {
    ScoreboardPatch,
    ScoreboardRecords,
} from "@multi-indiegame/runner-ipc-schema";

/**
 * 集計に入れる最短のプレイ時間。部屋を作っては捨てる繰り返しで、プレイとして
 * 成立していない記録が混ざるのを防ぐ。全コンテンツ共通で、投稿者は変えられない。
 */
const MIN_PLAY_SEC = Number.parseInt(
    process.env.SCORE_MIN_PLAY_SEC ?? "30",
    10,
);

export interface FinalizeParameterObject {
    playId: number;
    contentId: number;
    records: ScoreboardRecords;
    startedAt: number;
    endedAt: number;
    /** 投稿スクリプトの実行時エラーで終わったか */
    crashed: boolean;
    /**
     * 実行基盤が、最後の記録まで届け切ったと停止に応答したか。
     *
     * WHY: 間引き待ちだった最後の記録が届いていないと、手元にあるのは古い記録になる。
     */
    scoreDelivered: boolean;
}

/**
 * プレイの記録を確定させる。
 *
 * WHY: ここでは**誰の記録かを決めない**。同意はブラウザにしか現れず、実行基盤
 * からは見えないため、subjectKey は後段の突き合わせで埋まる。この段の仕事は
 * 「届いた記録を、あとから引ける形にして残す」ことに限る。
 *
 * WHY: すでに確定したプレイでは何もしない。確定の成否が呼び出し側へ届かず
 * 再試行されたとき、反映済みの行を置き換えると掲載用の印が消える。
 */
export async function finalizeScoreRecords(
    param: FinalizeParameterObject,
): Promise<void> {
    const entries = collectEntries(param.records);
    if (entries.length === 0) {
        return;
    }
    const content = await prisma.content.findUnique({
        where: { id: param.contentId },
        select: { gameId: true },
    });
    if (!content) {
        return;
    }
    const endedAt = new Date(param.endedAt);
    const durationSec = Math.max(
        0,
        Math.floor((param.endedAt - param.startedAt) / 1000),
    );
    // 集計に入れない記録も、印を付けて残す。後から方針を変えても作り直せる
    const excluded =
        param.crashed || !param.scoreDelivered || durationSec < MIN_PLAY_SEC;
    // WHY: 途中で失敗したら 1 件も残さない。一部だけ残ると、呼び出し側が
    // 丸ごと試し直すまでの間に、そのプレイの記録が欠けたまま突き合わされうる。
    // 1 件でも残っていれば、確定は済んでいる
    await prisma.$transaction(async (tx) => {
        const finalized = await tx.scoreRecord.findFirst({
            where: { playId: param.playId },
            select: { id: true },
        });
        if (finalized) {
            return;
        }
        for (const entry of entries) {
            await saveRecord(tx, {
                playId: param.playId,
                playerId: entry.playerId,
                gameId: content.gameId,
                contentId: param.contentId,
                endedAt,
                durationSec,
                excluded,
                patch: entry.patch,
            });
        }
    });
}

interface RecordEntry {
    playerId: string | null;
    patch: ScoreboardPatch;
}

function collectEntries(records: ScoreboardRecords): RecordEntry[] {
    const entries: RecordEntry[] = [];
    if (records.play && Object.keys(records.play).length > 0) {
        entries.push({ playerId: null, patch: records.play });
    }
    for (const [playerId, patch] of Object.entries(records.players ?? {})) {
        if (patch && Object.keys(patch).length > 0) {
            entries.push({ playerId, patch });
        }
    }
    return entries;
}

interface SaveRecordParameterObject {
    playId: number;
    playerId: string | null;
    gameId: number;
    contentId: number;
    endedAt: Date;
    durationSec: number;
    excluded: boolean;
    patch: ScoreboardPatch;
}

async function saveRecord(
    tx: Prisma.TransactionClient,
    param: SaveRecordParameterObject,
): Promise<void> {
    const data = {
        playId: param.playId,
        playerId: param.playerId,
        gameId: param.gameId,
        contentId: param.contentId,
        endedAt: param.endedAt,
        durationSec: param.durationSec,
        excluded: param.excluded,
    };
    const record = await tx.scoreRecord.create({ data, select: { id: true } });
    const values = Object.entries(param.patch).flatMap(([key, value]) => {
        if (!isValidRecordKey(key)) {
            return [];
        }
        const column = toColumn(value);
        if (!column) {
            return [];
        }
        return [
            {
                recordId: record.id,
                gameId: param.gameId,
                contentId: param.contentId,
                key,
                endedAt: param.endedAt,
                ...column,
            },
        ];
    });
    if (values.length > 0) {
        await tx.scoreValue.createMany({ data: values });
    }
}

/** @multi-indiegame/akashic-scoreboard の RECORD_KEY_PATTERN */
const RECORD_KEY_PATTERN = /^[a-zA-Z0-9_:-]{1,32}$/;

/** @multi-indiegame/akashic-scoreboard の RESERVED_RECORD_KEYS */
const RESERVED_RECORD_KEYS = ["__proto__"];

/**
 * キー名が拡張ライブラリの仕様に合うか。
 *
 * WHY: 拡張ライブラリでも弾いているが、値の型と同じく受け取る側でも確かめる
 * （PROTOCOL.md 8 章）
 */
function isValidRecordKey(key: string): boolean {
    return !RESERVED_RECORD_KEYS.includes(key) && RECORD_KEY_PATTERN.test(key);
}

/**
 * 値を、並べ替えや範囲指定ができる列へ振り分ける。
 *
 * WHY: 型が合わない値はここで落とす。runner と拡張ライブラリでも検証しているが、
 * external は同一オリジンなら直接叩けるので、受け取る側でも確かめる
 * （PROTOCOL.md 8 章）。
 */
function toColumn(
    value: ScoreboardPatch[string],
): { numValue: number } | { strValue: string } | { boolValue: boolean } | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? { numValue: value } : null;
    }
    if (typeof value === "string") {
        return { strValue: value };
    }
    if (typeof value === "boolean") {
        return { boolValue: value };
    }
    return null;
}
