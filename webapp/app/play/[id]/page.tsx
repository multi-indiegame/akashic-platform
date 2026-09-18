import type { Metadata } from "next";
import { cache } from "react";
import { prisma } from "@multi-indiegame/persist-schema";
import { publicBaseUrl, publicContentBaseUrl } from "@/lib/server/akashic";
import { getShareImageUrl } from "@/lib/server/play-share";
import { fetchGameJson, getContentViewSize } from "@/lib/server/play-utils";
import { PlayContainer } from "@/components/play-container";

const getPlayInfo = cache(async (playId: number) => {
    return await prisma.play.findUnique({
        where: { id: playId },
        select: {
            id: true,
            name: true,
            isActive: true,
            contentId: true,
            content: {
                select: {
                    icon: true,
                    game: {
                        select: {
                            title: true,
                            description: true,
                        },
                    },
                },
            },
        },
    });
});

async function getImageSize(contentId: number, withScreenshot: boolean) {
    if (withScreenshot) {
        return await getContentViewSize(await fetchGameJson(contentId));
    } else {
        return { width: 400, height: 400 };
    }
}

export async function generateMetadata({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ shareId?: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    if (id == null) {
        return {};
    }
    const playId = parseInt(id);
    const { shareId } = (await searchParams) ?? {};
    const info = await getPlayInfo(playId);
    if (!info) {
        return {};
    }
    const title = info.isActive
        ? `${info.content.game.title}をプレイ中`
        : `${info.content.game.title}で遊んでいたよ`;
    const description = info.isActive
        ? `ただいまゲームプレイ中！ ${info.name}`
        : `みんなで一緒に遊んでいたよ！また新しい部屋を作ろう！`;
    const imageUrl = shareId
        ? await getShareImageUrl(playId, shareId)
        : `${publicContentBaseUrl}/${info.contentId}/${info.content.icon}`;
    const { width, height } = await getImageSize(info.contentId, !!shareId);
    const canonicalQuery = new URLSearchParams();
    if (shareId) {
        canonicalQuery.set("shareId", shareId);
    }
    const canonical = `/play/${playId}?${canonicalQuery.toString()}`;
    return {
        metadataBase: new URL(publicBaseUrl),
        title: `${info.name}${info.isActive ? "" : " (終了)"} - みんなでゲーム! 自作ゲーム投稿・プレイサイト`,
        description,
        alternates: {
            canonical,
        },
        openGraph: {
            title,
            description,
            type: "website",
            url: canonical,
            images: [
                {
                    url: imageUrl,
                    width,
                    height,
                    alt: shareId
                        ? `${info.content.game.title}のスクリーンショット`
                        : `${info.content.game.title}`,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [imageUrl],
        },
    };
}

export default function Play() {
    return <PlayContainer />;
}
