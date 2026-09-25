import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import { GameInfo, GAMELIST_LIMITS } from "@/lib/types";
import { publicContentBaseUrl } from "@/lib/server/akashic";
import { fetchLicense } from "@/lib/server/game-info";
import { getFavoriteList } from "@/lib/server/favorite";
import { getAuth } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
    const keyword = req.nextUrl.searchParams.get("keyword") ?? undefined;
    const userId = req.nextUrl.searchParams.get("userId") ?? undefined;
    const limits = parseInt(
        req.nextUrl.searchParams.get("limits") ?? GAMELIST_LIMITS.toString(),
    );
    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "0");

    const containsKeyword: Awaited<
        NonNullable<Parameters<typeof prisma.game.findMany>[0]>["where"]
    > = keyword
        ? {
              OR: [
                  {
                      title: {
                          contains: keyword,
                      },
                  },
                  {
                      description: {
                          contains: keyword,
                      },
                  },
              ],
          }
        : undefined;

    const filtersUserId: Awaited<
        NonNullable<Parameters<typeof prisma.game.findMany>[0]>["where"]
    > = userId
        ? {
              publisherId: userId,
          }
        : undefined;

    const where: Awaited<
        NonNullable<Parameters<typeof prisma.game.findMany>[0]>["where"]
    > =
        containsKeyword && filtersUserId
            ? {
                  AND: [containsKeyword, filtersUserId],
              }
            : containsKeyword
              ? containsKeyword
              : filtersUserId
                ? filtersUserId
                : undefined;

    const result = await prisma.game.findMany({
        take: limits,
        skip: page * limits,
        where,
        orderBy: {
            id: "desc",
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
                    scoreboard: true,
                    updatedAt: true,
                },
                orderBy: {
                    id: "desc",
                },
            },
            createdAt: true,
        },
    });
    const auth = await getAuth();
    const favoritedGameIds = new Set(
        await getFavoriteList(
            auth,
            result.map((game) => game.id),
        ),
    );
    return NextResponse.json({
        ok: true,
        data: await Promise.all(
            result.map(
                async ({
                    id,
                    title,
                    description,
                    credit,
                    streaming,
                    playCount,
                    publisher,
                    versions,
                    createdAt,
                }) =>
                    ({
                        id,
                        title,
                        iconURL: `${publicContentBaseUrl}/${versions[0].id}/${versions[0].icon}`,
                        publisher: {
                            id: publisher.id,
                            name: publisher.name!,
                            image: publisher.image ?? undefined,
                        },
                        description,
                        credit,
                        streaming,
                        playCount,
                        license: await fetchLicense(versions[0].id),
                        contentId: versions[0].id,
                        isFavorited: favoritedGameIds.has(id),
                        hasScoreboard: versions[0].scoreboard,
                        createdAt,
                        updatedAt: versions[0].updatedAt,
                    }) satisfies GameInfo,
            ),
        ),
    });
}
