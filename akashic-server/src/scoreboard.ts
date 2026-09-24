import { prisma } from "@multi-indiegame/persist-schema";
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
    /** 投稿スクリプトの実行時エラーで終わったか */
    crashed: boolean;
}

/**
 * プレイの記録を確定させる。
 *
 * WHY: ここでは**誰の記録かを決めない**。同意はブラウザにしか現れず、実行基盤
 * からは見えないため、subjectKey は後段の突き合わせで埋まる。この段の仕事は
 * 「届いた記録を、あとから引ける形にして残す」ことに限る。
 *
 * WHY: 何度呼ばれても行が増えないよう upsert する。確定処理は終了処理の途中で
 * 走るので、再試行や競合で二度流れることがある。
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
    const endedAt = new Date();
    const durationSec = Math.max(
        0,
        Math.floor((endedAt.getTime() - param.startedAt) / 1000),
    );
    // 集計に入れない記録も、印を付けて残す。後から方針を変えても作り直せる
    const excluded = param.crashed || durationSec < MIN_PLAY_SEC;
    for (const entry of entries) {
        await saveRecord({
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

async function saveRecord(param: SaveRecordParameterObject): Promise<void> {
    const data = {
        playId: param.playId,
        playerId: param.playerId,
        gameId: param.gameId,
        contentId: param.contentId,
        endedAt: param.endedAt,
        durationSec: param.durationSec,
        excluded: param.excluded,
    };
    await prisma.$transaction(async (tx) => {
        const existing = await tx.scoreRecord.findFirst({
            where: { playId: param.playId, playerId: param.playerId },
            select: { id: true },
        });
        const record = existing
            ? await tx.scoreRecord.update({
                  where: { id: existing.id },
                  data,
                  select: { id: true },
              })
            : await tx.scoreRecord.create({ data, select: { id: true } });
        // records は差分ではなく全体なので、前回の行を置き換える
        await tx.scoreValue.deleteMany({ where: { recordId: record.id } });
        const values = Object.entries(param.patch).flatMap(([key, value]) => {
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
    });
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
