export type GameSort = "new" | "updated" | "popular";

export interface SearchParams {
    q?: string;
    /** 省略時はプラグインで絞り込まない */
    supported?: string[];
    sort: GameSort;
    page: number;
    limit: number;
}

export interface External {
    name: string;
    required: boolean;
}

export interface GameResponse {
    id: number;
    title: string;
    description: string;
    credit: string;
    iconUrl: string;
    pageUrl: string;
    publisher: {
        id: string;
        name: string;
    };
    contentId: number;
    contentsJsonUrl: string;
    licenseUrl: string;
    externals: External[];
    /** 実況・配信・動画投稿を許可しているか */
    streaming: boolean;
    playCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface GameListResponse {
    items: GameResponse[];
    page: number;
    limit: number;
    hasNext: boolean;
}

export interface ContentsJson {
    content_id: number;
    content_url: string;
    asset_base_url: string;
    engine_urls: string[];
    external: string[];
    untrusted: boolean;
}

export type ErrorReason = "InvalidParams" | "NotFound" | "InternalError";
