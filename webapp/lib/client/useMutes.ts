import useSWR from "swr";
import { MutesGetResponse } from "../types";

const fetcher = async (url: string) => {
    const res = (await (await fetch(url)).json()) as MutesGetResponse;
    if (!res.ok) {
        if (res.reason === "Unauthorized") {
            return undefined;
        }
        throw new Error(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }
    return { list: res.data, limit: res.limit };
};

export function useMutes(enabled: boolean) {
    const { isLoading, data, error, mutate } = useSWR(
        enabled ? "/api/mutes" : null,
        fetcher,
    );

    return {
        isLoading,
        list: data?.list,
        limit: data?.limit,
        error: error ? (error as Error).message : undefined,
        mutate,
    };
}
