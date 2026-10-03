import process from "node:process";

/** webapp の公開 URL。ゲームページの URL に使う */
export const publicBaseUrl =
    process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";

/** コンテンツ配信の公開 URL。webapp の同名の設定と同じ値にする */
export const publicContentBaseUrl =
    process.env.PUBLIC_CONTENT_BASE_URL ??
    "http://localhost:9000/akashic-content";

/** 本 API の公開 URL。省略時はリクエストのホスト名から組み立てる */
export const publicApiBaseUrl = process.env.PUBLIC_API_BASE_URL;
