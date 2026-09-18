import { prisma } from "@multi-indiegame/persist-schema";
import { GameInfo } from "../types";
import { internalContentBaseUrl, publicContentBaseUrl } from "./akashic";
import { getAuth } from "./auth";
import { isFavorited } from "./favorite";

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
    return {
        id: game.id,
        title: game.title,
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
