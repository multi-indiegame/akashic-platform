"use client";

import { ReactNode } from "react";
import { CustomDataContext } from "@/lib/client/custom-data-context";

export function CustomDataProvider({
    customFooterHref,
    customFooterLabel,
    customFooterImagePath,
    customFooterImageWidth,
    niconicommonsWorkUrl,
    clientLogCacheMaxEntries,
    titleRankImageUrlPattern,
    children,
}: {
    customFooterHref?: string;
    customFooterLabel?: string;
    customFooterImagePath?: string;
    customFooterImageWidth?: number;
    niconicommonsWorkUrl?: string;
    clientLogCacheMaxEntries: number;
    titleRankImageUrlPattern?: string;
    children: ReactNode;
}) {
    return (
        <CustomDataContext
            value={{
                customFooterHref,
                customFooterLabel,
                customFooterImagePath,
                customFooterImageWidth,
                niconicommonsWorkUrl,
                clientLogCacheMaxEntries,
                titleRankImageUrlPattern,
            }}
        >
            {children}
        </CustomDataContext>
    );
}
