import useSWR from "swr";
import { FavoriteListResponse, GameInfo } from "../types";

const fetcher = async (url: string): Promise<GameInfo[]> => {
    const res = (await (await fetch(url)).json()) as FavoriteListResponse;
    if (!res.ok) {
        switch (res.reason) {
            case "Unauthorized":
                throw new Error("サインインが必要です。");
            case "InternalError":
            default:
                throw new Error("不明なエラーが発生しました。");
        }
    }
    return res.data;
};

export function useFavorites(enabled: boolean) {
    const { isLoading, data, error } = useSWR(
        enabled ? "/api/favorites" : null,
        fetcher,
    );
    return {
        isLoading,
        data,
        error,
    };
}
