import type { ScoreTitleRank } from "@multi-indiegame/persist-schema";

export const TITLE_RANKS: { value: ScoreTitleRank; label: string }[] = [
    { value: "NONE", label: "段位なし" },
    { value: "BRONZE", label: "ブロンズ" },
    { value: "SILVER", label: "シルバー" },
    { value: "GOLD", label: "ゴールド" },
];

export const TITLE_RANK_COLOR: { [key in ScoreTitleRank]: string | undefined } =
    {
        NONE: undefined,
        BRONZE: "#9C6B3F",
        SILVER: "#6E7A88",
        GOLD: "#A8801C",
    };

/**
 * 文字向けの落ち着いた色でも段位の差を見分けられるように
 */
export const TITLE_RANK_LIGHT_COLOR: {
    [key in ScoreTitleRank]: string | undefined;
} = {
    NONE: undefined,
    BRONZE: "#CD7F32",
    SILVER: "#C9D1D9",
    GOLD: "#F2C12E",
};

export function titleRankLabel(rank: ScoreTitleRank): string {
    return TITLE_RANKS.find((r) => r.value === rank)?.label ?? rank;
}
