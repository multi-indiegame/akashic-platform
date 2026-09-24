import { createContext } from "react";

export const CustomDataContext = createContext<{
    customFooterHref?: string;
    customFooterLabel?: string;
    customFooterImagePath?: string;
    customFooterImageWidth?: number;
    niconicommonsWorkUrl?: string;
    clientLogCacheMaxEntries: number;
    titleRankImageUrlPattern?: string;
} | null>(null);
