export const customFooterHref = process.env.CUSTOM_FOOTER_HREF;
export const customFooterLabel = process.env.CUSTOM_FOOTER_LABEL;
export const customFooterImageWidth = process.env.CUSTOM_FOOTER_IMAGE_WIDTH
    ? Number.parseInt(process.env.CUSTOM_FOOTER_IMAGE_WIDTH)
    : undefined;
export const customFooterImagePath = process.env.CUSTOM_FOOTER_IMAGE_PATH;
export const niconicommonsWorkUrl = process.env.NICONICOMMONS_WORK_URL;
export const clientLogCacheMaxEntries = Number.parseInt(
    process.env.CLIENT_LOG_CACHE_MAX_ENTRIES ?? "1000",
);
export const drainRefreshInterval = Number.parseInt(
    process.env.DRAIN_REFRESH_INTERVAL ?? "5000",
);

/**
 * 段位ごとの既定の称号画像。`{rank}` を段位（小文字）に置き換えて使う。
 */
export const titleRankImageUrlPattern =
    process.env.TITLE_RANK_IMAGE_URL_PATTERN ??
    `${process.env.PUBLIC_BASE_URL ?? "http://localhost:3000"}/image/rank/{rank}.png`;
