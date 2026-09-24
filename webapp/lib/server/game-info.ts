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
    // WHY: 称号の画像に表示が求められる素材が含まれることがある。
    const titleCredits = await prisma.scoreTitleDef.findMany({
        where: { gameId, imageCredit: { not: null } },
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
        hasScoreboard: (await fetchContentExternal(contentId)).includes(
            "scoreboard",
        ),
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
