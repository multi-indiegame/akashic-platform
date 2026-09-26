import type {
    ScoreFieldSetting,
    ScoreValueType,
} from "@multi-indiegame/scoreboard-schema";

/** 届いた値の型ごとの数 */
export type ScoreValueTypeCounts = { [type in ScoreValueType]: number };

const TYPE_ORDER: ScoreValueType[] = ["number", "boolean", "string"];

export function typeLabel(type: ScoreValueType) {
    switch (type) {
        case "number":
            return "数値";
        case "boolean":
            return "真偽値";
        case "string":
            return "文字列";
    }
}

/** 1 件以上届いている型 */
export function presentTypes(counts: ScoreValueTypeCounts): ScoreValueType[] {
    return TYPE_ORDER.filter((type) => counts[type] > 0);
}

/** 「数値 3 件、真偽値 2 件」のような内訳 */
export function describeTypeCounts(counts: ScoreValueTypeCounts): string {
    return presentTypes(counts)
        .map((type) => `${typeLabel(type)} ${counts[type]} 件`)
        .join("、");
}

/**
 * 統計に出すキーか。
 *
 * WHY: 文字列として選ばれたキーは出さない。種類が混在したキーで投稿者が文字列を
 * 選んでも、混ざった数値や真偽値が集計されて出てしまうため。
 */
export function isShownOnStats(setting: ScoreFieldSetting): boolean {
    return !setting.hidden && setting.valueType !== "string";
}
