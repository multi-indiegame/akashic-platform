import { prisma } from "@multi-indiegame/persist-schema";

/**
 * 記録の引き方は投稿者が決める。引き方は歴代・直近でも同じ設定。
 * 集計外のデータは保持しないので、設定変更時は残っている生レコードから積み直す。
 */

/** 上位の決め方 */
export type ScoreDirection = "high" | "low";

/** 主体 1 人分の代表値をどう採るか */
export type ScoreAggregate = "best" | "latest" | "sum" | "count";

/**
 * 同一の主体が何度もランクインしてよいか。
 *
 * - `best`: 主体ごとに 1 件だけ載せる
 * - `all`: 1 プレイ 1 件として載せる。同じ人が何度でも載る
 */
export type ScoreDedupe = "best" | "all";

/** 記録される値の種類。投稿者が先に設定するときの申告に使う */
export type ScoreValueType = "number" | "string" | "boolean";

export interface ScoreFieldSetting {
    /** 見出し。省略するとキー名をそのまま使う */
    label?: string;
    /**
     * 投稿者が見込んでいる値の種類。
     *
     * WHY: 記録が届く前でも見せ方を決められるようにするため。集計はここを見ずに
     * 実際の値で行う。届いた値と食い違ったら、設定画面で知らせる材料になる。
     */
    valueType?: ScoreValueType;
    unit?: string;
    direction: ScoreDirection;
    aggregate: ScoreAggregate;
    dedupe: ScoreDedupe;
    /** 代表値を記録した日時を出すか */
    showTimestamp: boolean;
    /** 統計ページに出さない */
    hidden: boolean;
    /** 棒グラフを出さない。既定は出す */
    chartHidden?: boolean;
}

export interface ScoreboardFormatDefinition {
    version: number;
    fields: { [key: string]: Partial<ScoreFieldSetting> };
    /**
     * プレイ自体の記録の見せ方。
     *
     * WHY: プレイヤーごとの記録とキー名が重なることがある（同じ出来事を両方へ
     * 報告するゲームがある）ので、設定は分けて持つ。
     */
    playFields?: { [key: string]: Partial<ScoreFieldSetting> };
    /**
     * 「遊んだ回数」のランキングの見せ方。
     *
     * WHY: キーごとの設定と同じ形で持つ。棒グラフの有無も、他のランキングと
     * 同じように 1 つずつ決められるようにする。
     */
    playRanking: { hidden: boolean; label?: string; chartHidden?: boolean };
}

export const DEFAULT_FIELD_SETTING: ScoreFieldSetting = {
    direction: "high",
    aggregate: "best",
    dedupe: "best",
    showTimestamp: false,
    hidden: false,
};

/**
 * プレイ自体の記録の既定。
 *
 * WHY: **既定では出さない。** ゲームが進行のために送っているだけのキーが、
 * 投稿者の意図と関係なく統計ページへ出るのを避ける。
 */
export const DEFAULT_PLAY_FIELD_SETTING: ScoreFieldSetting = {
    direction: "high",
    aggregate: "count",
    dedupe: "best",
    showTimestamp: false,
    hidden: true,
};

export const DEFAULT_FORMAT: ScoreboardFormatDefinition = {
    version: 0,
    fields: {},
    playFields: {},
    playRanking: { hidden: false },
};

/**
 * そのゲームで有効なフォーマットを読む。
 *
 * WHY: 未設定でも統計は出す。投稿者が何もしなくても推奨値で見えるほうが、
 * まず動かして確かめられる。
 */
export async function fetchFormat(
    gameId: number,
): Promise<ScoreboardFormatDefinition> {
    const row = await prisma.scoreboardFormat.findFirst({
        where: { gameId },
        orderBy: { version: "desc" },
        select: { definition: true },
    });
    if (!row) {
        return DEFAULT_FORMAT;
    }
    return normalizeFormat(row.definition);
}

/**
 * その時点で有効だったフォーマットを読む。
 *
 * WHY: 閉じた月のアーカイブは「当時のフォーマット」で凍結する。あとで投稿者が
 * 設定を変えても、過去の月の見え方が変わらないようにするため。
 */
export async function fetchFormatAt(
    gameId: number,
    at: Date,
): Promise<ScoreboardFormatDefinition> {
    const row = await prisma.scoreboardFormat.findFirst({
        where: { gameId, effectiveFrom: { lt: at } },
        orderBy: { effectiveFrom: "desc" },
        select: { definition: true },
    });
    if (!row) {
        return DEFAULT_FORMAT;
    }
    return normalizeFormat(row.definition);
}

export function normalizeFormat(raw: unknown): ScoreboardFormatDefinition {
    if (!raw || typeof raw !== "object") {
        return DEFAULT_FORMAT;
    }
    const source = raw as Partial<ScoreboardFormatDefinition>;
    return {
        version: typeof source.version === "number" ? source.version : 0,
        fields:
            source.fields && typeof source.fields === "object"
                ? source.fields
                : {},
        playFields:
            source.playFields && typeof source.playFields === "object"
                ? source.playFields
                : {},
        playRanking: {
            hidden: !!source.playRanking?.hidden,
            label: source.playRanking?.label,
            chartHidden: !!source.playRanking?.chartHidden,
        },
    };
}

export function fieldSetting(
    format: ScoreboardFormatDefinition,
    key: string,
): ScoreFieldSetting {
    return { ...DEFAULT_FIELD_SETTING, ...(format.fields[key] ?? {}) };
}

/** プレイ自体の記録の設定。載せると決められていなければ非表示 */
export function playFieldSetting(
    format: ScoreboardFormatDefinition,
    key: string,
): ScoreFieldSetting {
    return {
        ...DEFAULT_PLAY_FIELD_SETTING,
        ...(format.playFields?.[key] ?? {}),
    };
}
