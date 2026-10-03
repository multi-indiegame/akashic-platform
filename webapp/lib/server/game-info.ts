import { prisma } from "@multi-indiegame/persist-schema";
import { GameInfo } from "../types";
import { internalContentBaseUrl, publicContentBaseUrl } from "./akashic";
import { getAuth } from "./auth";
import { isFavorited } from "./favorite";
import { fetchContentExternal } from "./content-get-external";

export async function fetchGameInfo(gameId: number) {
    const game = await prisma.game.findUniqueOrThrow({
        where: {
            id: gameId,
        },
        select: {
            id: true,
            title: true,
            description: true,
            credit: true,
            streaming: true,
            externalLaunch: true,
            playCount: true,
            publisher: {
                select: {
                    id: true,
                    name: true,
                    image: true,
                },
            },
            versions: {
                take: 1,
                select: {
                    id: true,
                    icon: true,
                    scoreboard: true,
                    externals: {
                        select: { name: true, required: true },
                        orderBy: { name: "asc" },
                    },
                    updatedAt: true,
                },
                orderBy: {
                    id: "desc",
                },
            },
            createdAt: true,
        },
    });
    const contentId = game.versions[0].id;
    // この記録を始める前に投稿されたバージョンは行を持たないため、game.json から導出する
    const externals =
        game.versions[0].externals.length > 0
            ? game.versions[0].externals
            : (await fetchContentExternal(contentId)).map((name) => ({
                  name,
                  required: false,
              }));
    // WHY: 称号の画像に表示が求められる素材が含まれることがある。
    const titleCredits = await prisma.scoreTitleDef.findMany({
        where: { gameId, imageKey: { not: null }, imageCredit: { not: null } },
        orderBy: [{ priority: "asc" }, { id: "asc" }],
        select: { name: true, imageCredit: true },
    });
    return {
        id: game.id,
        title: game.title,
        // 宣言しているゲームにだけ統計の入口を出す
        titleCredits: titleCredits.map((def) => ({
            name: def.name,
            credit: def.imageCredit!,
        })),
        hasScoreboard: game.versions[0].scoreboard,
        externalLaunch: game.externalLaunch,
        externals,
        iconURL: `${publicContentBaseUrl}/${game.versions[0].id}/${game.versions[0].icon}`,
        publisher: {
            id: game.publisher.id,
            name: game.publisher.name!,
            image: game.publisher.image ?? undefined,
        },
        description: game.description,
        credit: game.credit,
        streaming: game.streaming,
        playCount: game.playCount,
        license: await fetchLicense(game.versions[0].id),
        contentId: game.versions[0].id,
        isFavorited: await isFavorited(await getAuth(), game.id),
        createdAt: game.createdAt,
        updatedAt: game.versions[0].updatedAt,
    } satisfies GameInfo;
}

export async function fetchLicense(contentId: number) {
    const res = await fetch(
        `${internalContentBaseUrl}/${contentId}/library_license.txt`,
    );
    if (res.status === 200) {
        return await res.text();
    }
    return undefined;
}
