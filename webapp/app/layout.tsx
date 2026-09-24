import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { Geist, Geist_Mono } from "next/font/google";
import { Box, CssBaseline, ThemeProvider } from "@mui/material";
import { getAuth } from "@/lib/server/auth";
import {
    publicContentBaseUrl,
    publicPlaylogServerUrl,
    publicOtelExporterUrl,
} from "@/lib/server/akashic";
import { getDrainState } from "@/lib/server/drain-state";
import {
    customFooterLabel,
    customFooterImagePath,
    customFooterImageWidth,
    customFooterHref,
    niconicommonsWorkUrl,
    clientLogCacheMaxEntries,
    drainRefreshInterval,
    titleRankImageUrlPattern,
} from "@/lib/server/custom-data";
import { theme } from "@/lib/client/theme";
import { AkashicProvider } from "@/components/akashic-provider";
import { AuthProvider } from "@/components/auth-provider";
import { CustomDataProvider } from "@/components/custom-data-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ToastMessage } from "@/components/toast-message";
import { TracingProvider } from "@/components/tracing-provider";
import { DrainBanner } from "@/components/drain-banner";

const geistSans = Geist({
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "みんなでゲーム! 自作ゲーム投稿・プレイサイト",
    description:
        "みんなで遊べるゲームをみんなで遊ぼう。自作ゲームを投稿して遊べるサイトです。",
};

export default async function RootLayout({
    children,
}: Readonly<{ children: ReactNode }>) {
    const user = await getAuth();
    const drainState = getDrainState();
    return (
        <html
            lang="ja"
            className={`${geistSans.className} ${geistMono.className} antialiased`}
        >
            <body>
                <TracingProvider
                    otlpEndpoint={publicOtelExporterUrl}
                    storageUrl={publicPlaylogServerUrl}
                />
                <AppRouterCacheProvider>
                    <AkashicProvider
                        playlogServerUrl={publicPlaylogServerUrl}
                        publicContentBaseUrl={publicContentBaseUrl}
                    >
                        <CustomDataProvider
                            customFooterHref={customFooterHref}
                            customFooterLabel={customFooterLabel}
                            customFooterImagePath={customFooterImagePath}
                            customFooterImageWidth={customFooterImageWidth}
                            niconicommonsWorkUrl={niconicommonsWorkUrl}
                            clientLogCacheMaxEntries={clientLogCacheMaxEntries}
                            titleRankImageUrlPattern={titleRankImageUrlPattern}
                        >
                            <AuthProvider user={user}>
                                <ThemeProvider theme={theme}>
                                    <CssBaseline />
                                    <Box
                                        sx={{
                                            display: "flex",
                                            flexDirection: "column",
                                            minHeight: "100vh",
                                        }}
                                    >
                                        <SiteHeader />
                                        <DrainBanner
                                            initialState={drainState}
                                            refreshInterval={
                                                drainRefreshInterval
                                            }
                                        />
                                        {/* ページ側が flexGrow で余白まで使えるよう flex に */}
                                        <Box
                                            component="main"
                                            sx={{
                                                flexGrow: 1,
                                                display: "flex",
                                                flexDirection: "column",
                                            }}
                                        >
                                            {children}
                                        </Box>
                                        <SiteFooter />
                                        <ToastMessage />
                                    </Box>
                                </ThemeProvider>
                            </AuthProvider>
                        </CustomDataProvider>
                    </AkashicProvider>
                </AppRouterCacheProvider>
            </body>
        </html>
    );
}
