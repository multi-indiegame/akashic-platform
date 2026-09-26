"use server";

import { prisma } from "@multi-indiegame/persist-schema";
import {
    DEFAULT_FIELD_SETTING,
    ScoreFieldSetting,
    ScoreboardFormatDefinition,
    fetchFormat,
    fieldSetting,
    playFieldSetting,
    rebuildTopEntries,
} from "@multi-indiegame/scoreboard-schema";
import { RECORD_KEY_PATTERN } from "../types";
import { getSignedInUser } from "./auth";
import { isWriteBlocked } from "./drain-state";
import { logSafe } from "./log-safe";

const LABEL_MAX_LENGTH = 40;
const UNIT_MAX_LENGTH = 8;

const formatErrReasons = [
    "InvalidParams",
    "NotFound",
    "Unauthorized",
    "InternalError",
    "Drain",
] as const;
type FormatErrorType = (typeof formatErrReasons)[number];

export type SaveFormatResponse =
    { ok: true } | { ok: false; reason: FormatErrorType };

/**
 * 投稿者が決めた引き方を保存する。
 *
 * WHY: 複数ランクインの上位 N 件の持ち方が変わったキーは積み直す。上位 N 件は
 * いまの設定の分だけを積んでいるので、設定が変われば作り直す。**残っている
 * 生レコードの分しか戻らない**（それより前は失われる）。
 */
export async function saveScoreboardFormat(
    gameId: number,
    fields: { [key: string]: Partial<ScoreFieldSetting> },
    playRankingHidden: boolean,
    playFields: { [key: string]: Partial<ScoreFieldSetting> } = {},
    playRankingChartHidden = false,
): Promise<SaveFormatResponse> {
    if (isWriteBlocked()) {
        return { ok: false, reason: "Drain" };
    }
    if (!Number.isSafeInteger(gameId)) {
        return { ok: false, reason: "InvalidParams" };
    }
    // 所有者判定に使う id はクライアントから受け取らずセッションから決める
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return { ok: false, reason: auth.reason };
    }
    const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { publisherId: true },
    });
    if (!game) {
        return { ok: false, reason: "NotFound" };
    }
    if (game.publisherId !== auth.user.id) {
        return { ok: false, reason: "Unauthorized" };
    }
    const normalized = normalizeFields(fields);
    const normalizedPlay = normalizeFields(playFields);
    if (!normalized || !normalizedPlay) {
        return { ok: false, reason: "InvalidParams" };
    }
    try {
        const previous = await fetchFormat(gameId);
        const latest = await prisma.scoreboardFormat.findFirst({
            where: { gameId },
            orderBy: { version: "desc" },
            select: { version: true },
        });
        const definition: ScoreboardFormatDefinition = {
            version: (latest?.version ?? 0) + 1,
            fields: normalized,
            playFields: normalizedPlay,
            playRanking: {
                hidden: playRankingHidden,
                chartHidden: playRankingChartHidden,
            },
        };
        await prisma.scoreboardFormat.create({
            data: {
                gameId,
                version: definition.version,
                // WHY: Json 列は索引付きの型を要求する。定義そのものは型で
                // 縛っているので、ここでの変換は保存のためだけのもの
                definition: JSON.parse(JSON.stringify(definition)),
            },
        });
        const changed = Object.keys({
            ...previous.fields,
            ...normalized,
        }).filter((key) =>
            affectsTopEntries(
                fieldSetting(previous, key),
                fieldSetting(definition, key),
            ),
        );
        await rebuildTopEntries(gameId, changed);
        return { ok: true };
    } catch (err) {
        console.warn(
            "failed to save scoreboard format (gameId = %s)",
            logSafe(gameId),
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}

/**
 * 複数ランクインの上位 N 件の持ち方が変わるか。
 *
 * WHY: 積み直すと生レコードより前の上位記録を失うので、必要なときに限る。
 * 見出し・単位・代表値は表示時の選び方が変わるだけで、積み方には効かない。
 * 1 人 1 件だけのキーは主体ごとの歴代から引くので、向きを変えても積み直さない
 */
function affectsTopEntries(
    before: ScoreFieldSetting,
    after: ScoreFieldSetting,
): boolean {
    if (before.dedupe !== after.dedupe) {
        return true;
    }
    return after.dedupe === "all" && before.direction !== after.direction;
}

/**
 * WHY: 既定値と同じ指定は書き込まない。
 */
function normalizeFields(fields: {
    [key: string]: Partial<ScoreFieldSetting>;
}): { [key: string]: Partial<ScoreFieldSetting> } | null {
    const defaults = DEFAULT_FIELD_SETTING;
    const result: { [key: string]: Partial<ScoreFieldSetting> } = {};
    for (const [key, raw] of Object.entries(fields ?? {})) {
        if (typeof key !== "string" || !RECORD_KEY_PATTERN.test(key)) {
            return null;
        }
        const setting: Partial<ScoreFieldSetting> = {};
        if (raw.label != null) {
            const label = String(raw.label).trim();
            if (label.length > LABEL_MAX_LENGTH) {
                return null;
            }
            if (label) {
                setting.label = label;
            }
        }
        if (raw.unit != null) {
            const unit = String(raw.unit).trim();
            if (unit.length > UNIT_MAX_LENGTH) {
                return null;
            }
            if (unit) {
                setting.unit = unit;
            }
        }
        if (raw.direction && raw.direction !== defaults.direction) {
            if (raw.direction !== "low") {
                return null;
            }
            setting.direction = raw.direction;
        }
        if (raw.aggregate && raw.aggregate !== defaults.aggregate) {
            if (
                !["best", "latest", "sum", "count", "rate"].includes(
                    raw.aggregate,
                )
            ) {
                return null;
            }
            setting.aggregate = raw.aggregate;
        }
        if (raw.dedupe && raw.dedupe !== defaults.dedupe) {
            if (raw.dedupe !== "all") {
                return null;
            }
            setting.dedupe = raw.dedupe;
        }
        if (raw.showTimestamp) {
            setting.showTimestamp = true;
        }
        if (raw.hidden) {
            setting.hidden = true;
        }
        if (raw.chartHidden) {
            setting.chartHidden = true;
        }
        if (raw.valueType) {
            if (!["number", "string", "boolean"].includes(raw.valueType)) {
                return null;
            }
            setting.valueType = raw.valueType;
        }
        result[key] = setting;
    }
    return result;
}

export interface FieldCandidate {
    key: string;
    /** 実際に届いた値の型。選べるセクションを絞るのに使う */
    type: "number" | "string" | "boolean";
    /** 届いている記録の数 */
    recordCount: number;
    /** 届いた値の型ごとの数。型の食い違いを知らせるのに使う */
    counts: { number: number; string: number; boolean: number };
    /** 記録が届いていない、投稿者が先に決めただけのキーか */
    declaredOnly: boolean;
    /** 見せ方が決められているか */
    configured: boolean;
    setting: ScoreFieldSetting;
}

export interface FormatEditorData {
    playRankingHidden: boolean;
    playRankingChartHidden: boolean;
    candidates: FieldCandidate[];
    /** プレイ自体の記録の候補 */
    playCandidates: FieldCandidate[];
    /**
     * 決められていないときの値。
     *
     * WHY: 画面はクライアント側で動くので、スキーマのパッケージを直接読めない
     * （サーバー専用のモジュールを抱えているため）。既定値はここで渡す。
     */
    defaults: ScoreFieldSetting;
}

/**
 * 編集画面に出す候補を集める。
 *
 * WHY: JSON を直接書かせない。実際に届いたキーと型を並べ、型に合う選択肢だけを
 * 出す。
 *
 * WHY: 届いたキーだけでなく、投稿者が先に決めたキーも並べる。遊ばれる前に
 * 見せ方を決めておけるようにするため。どちらなのかは `declaredOnly` で分かる。
 */
export async function fetchFormatEditorData(
    gameId: number,
): Promise<FormatEditorData | null> {
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return null;
    }
    const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { publisherId: true },
    });
    if (!game || game.publisherId !== auth.user.id) {
        return null;
    }
    const format = await fetchFormat(gameId);
    const [rows, playRows] = await Promise.all([
        prisma.scoreValue.groupBy({
            by: ["key"],
            where: { gameId, record: { playerId: { not: null } } },
            _count: {
                _all: true,
                numValue: true,
                strValue: true,
                boolValue: true,
            },
            orderBy: { key: "asc" },
        }),
        prisma.scoreValue.groupBy({
            by: ["key"],
            where: { gameId, record: { playerId: null } },
            _count: {
                _all: true,
                numValue: true,
                strValue: true,
                boolValue: true,
            },
            orderBy: { key: "asc" },
        }),
    ]);
    return {
        playRankingHidden: format.playRanking.hidden,
        playRankingChartHidden: !!format.playRanking.chartHidden,
        defaults: DEFAULT_FIELD_SETTING,
        candidates: toCandidates(rows, format.fields ?? {}, (key) =>
            fieldSetting(format, key),
        ),
        playCandidates: toCandidates(playRows, format.playFields ?? {}, (key) =>
            playFieldSetting(format, key),
        ),
    };
}

type GroupedRow = {
    key: string;
    _count: {
        _all: number;
        numValue: number;
        strValue: number;
        boolValue: number;
    };
};

function toCandidates(
    rows: GroupedRow[],
    configured: { [key: string]: Partial<ScoreFieldSetting> },
    setting: (key: string) => ScoreFieldSetting,
): FieldCandidate[] {
    const candidates = rows.map((row) => ({
        key: row.key,
        type: dominantType(row._count),
        recordCount: row._count._all,
        counts: {
            number: row._count.numValue,
            string: row._count.strValue,
            boolean: row._count.boolValue,
        },
        declaredOnly: false,
        configured: configured[row.key] !== undefined,
        setting: setting(row.key),
    }));
    const reported = new Set(candidates.map((c) => c.key));
    // 記録が届いていない、先に決めただけのキー
    for (const key of Object.keys(configured)) {
        if (reported.has(key)) {
            continue;
        }
        const current = setting(key);
        candidates.push({
            key,
            type: current.valueType ?? "number",
            recordCount: 0,
            counts: { number: 0, string: 0, boolean: 0 },
            declaredOnly: true,
            configured: true,
            setting: current,
        });
    }
    return candidates.sort((a, b) => (a.key < b.key ? -1 : 1));
}

function dominantType(count: {
    numValue: number;
    strValue: number;
    boolValue: number;
}): FieldCandidate["type"] {
    if (count.numValue >= count.strValue && count.numValue >= count.boolValue) {
        return count.numValue > 0 ? "number" : "string";
    }
    return count.boolValue >= count.strValue ? "boolean" : "string";
}
