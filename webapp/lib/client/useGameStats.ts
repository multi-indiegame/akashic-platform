import useSWR from "swr";
import { GameStatsResponse, StatsPeriod } from "../types";

const fetcher = async (url: string) => {
    const res = (await (await fetch(url)).json()) as GameStatsResponse;
    if (!res.ok) {
        switch (res.reason) {
            case "InvalidParams":
                throw new Error(
                    "内部エラーが発生しました。一度戻ってリトライしてください。",
                );
            case "NotFound":
                throw new Error("ゲームが見つかりませんでした。");
            case "InternalError":
            default:
                throw new Error(
                    "予期しないエラーが発生しました。時間をおいてリトライしてください。",
                );
        }
    }
    return res.data;
};

export function useGameStats(id: string, period: StatsPeriod, month?: string) {
    const query =
        period === "month"
            ? `period=month&month=${month ?? ""}`
            : `period=${period}`;
    const { isLoading, data, error } = useSWR(
        period === "month" && !month ? null : `/api/game/${id}/stats?${query}`,
        fetcher,
    );
    return {
        isLoading,
        stats: data,
        error: error ? error.message : undefined,
    };
}
