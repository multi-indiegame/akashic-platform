import type { GameSort, SearchParams } from "./types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
// OFFSET が大きいほど DB が読み飛ばす行が増えるため、ページ数にも上限を設ける
const MAX_PAGE = 1000;
const MAX_QUERY_LENGTH = 100;
const MAX_SUPPORTED_PLUGINS = 50;
const MAX_INT32 = 2147483647;
const sorts: GameSort[] = ["new", "updated", "popular"];

function parseInteger(
    value: string | undefined,
    { min, max, fallback }: { min: number; max: number; fallback: number },
) {
    if (value == null) {
        return fallback;
    }
    if (!/^\d{1,10}$/.test(value)) {
        return undefined;
    }
    const n = Number(value);
    return n >= min && n <= max ? n : undefined;
}

export function parseSearchParams(
    query: Record<string, string | undefined>,
): SearchParams | undefined {
    const q = query.q?.trim() || undefined;
    if (q && q.length > MAX_QUERY_LENGTH) {
        return undefined;
    }
    let supported: string[] | undefined;
    if (query.supported != null) {
        supported = query.supported
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name.length > 0);
        if (supported.length > MAX_SUPPORTED_PLUGINS) {
            return undefined;
        }
    }
    const sort = (query.sort ?? "new") as GameSort;
    if (!sorts.includes(sort)) {
        return undefined;
    }
    const page = parseInteger(query.page, {
        min: 0,
        max: MAX_PAGE,
        fallback: 0,
    });
    const limit = parseInteger(query.limit, {
        min: 1,
        max: MAX_LIMIT,
        fallback: DEFAULT_LIMIT,
    });
    if (page == null || limit == null) {
        return undefined;
    }
    return { q, supported, sort, page, limit };
}

export function parseGameId(value: string) {
    if (!/^[1-9]\d{0,9}$/.test(value)) {
        return undefined;
    }
    const n = Number(value);
    return n <= MAX_INT32 ? n : undefined;
}
