import type { Metadata } from "next";
import { cache } from "react";
import { prisma } from "@multi-indiegame/persist-schema";
import { publicBaseUrl, publicContentBaseUrl } from "@/lib/server/akashic";
import { GameStatsPageView } from "@/components/game-stats-page";

/**
 * WHY: 統計ページは共有される前提の入口なので、リンクを貼った先でゲームが
 * 分かるようにする。中身（ランキング）は見る人や期間で変わるため、カードには
 * 動かないゲームアイコンを出す。
 */
const getGame = cache(async (gameId: number) => {
    if (!Number.isInteger(gameId) || gameId < 0) {
        return null;
    }
    return await prisma.game.findUnique({
        where: { id: gameId },
        select: {
            id: true,
            title: true,
            description: true,
            versions: {
                take: 1,
                orderBy: { id: "desc" },
                select: { id: true, icon: true },
            },
        },
    });
});

export async function generateMetadata(
    props: PageProps<"/game/[id]/stats">,
): Promise<Metadata> {
    const { id } = await props.params;
    const game = await getGame(Number(id));
    if (!game) {
        return { title: "みんなでゲーム!" };
    }
    const title = `${game.title} のみんなの記録 - みんなでゲーム!`;
    const description = `${game.title} でみんなが残した記録と称号。`;
    const version = game.versions[0];
    const imageUrl = version
        ? `${publicContentBaseUrl}/${version.id}/${version.icon}`
        : undefined;
    const canonical = `/game/${game.id}/stats`;
    return {
        metadataBase: new URL(publicBaseUrl),
        title,
        description,
        alternates: { canonical },
        openGraph: {
            title,
            description,
            type: "website",
            url: canonical,
            images: imageUrl
                ? [
                      {
                          url: imageUrl,
                          width: 400,
                          height: 400,
                          alt: game.title,
                      },
                  ]
                : undefined,
        },
        twitter: {
            card: "summary",
            title,
            description,
            images: imageUrl ? [imageUrl] : undefined,
        },
    };
}

export default function GameStatsPage() {
    return <GameStatsPageView />;
}
