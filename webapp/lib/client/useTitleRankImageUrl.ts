import type { ScoreTitleRank } from "@multi-indiegame/persist-schema";
import { useCustomData } from "./useCustomData";

export function useTitleRankImageUrl() {
    const { titleRankImageUrlPattern } = useCustomData();
    return (rank?: ScoreTitleRank) => {
        if (!rank || rank === "NONE" || !titleRankImageUrlPattern) {
            return undefined;
        }
        return titleRankImageUrlPattern.replace("{rank}", rank.toLowerCase());
    };
}
