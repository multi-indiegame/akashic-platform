import type { PrismaClient } from "@multi-indiegame/persist-schema/client";
import type {
    ContentJson,
    External,
    GameResponse,
    SearchParams,
} from "./types";

export interface UrlConfig {
    publicBaseUrl: string;
    publicContentBaseUrl: string;
    publicApiBaseUrl: string;
}

const gameSelect = {
    id: true,
    title: true,
    description: true,
    credit: true,
    streaming: true,
    playCount: true,
    createdAt: true,
    publisher: {
        select: {
            id: true,
            name: true,
            image: true,
        },
    },
    versions: {
        take: 1,
        orderBy: { id: "desc" },
        select: {
            id: true,
            icon: true,
            createdAt: true,
            externals: {
                select: { name: true, required: true },
                orderBy: { name: "asc" },
            },
        },
    },
} as const;

interface GameRow {
    id: number;
    title: string;
    description: string;
    credit: string;
    streaming: boolean;
    playCount: number;
    createdAt: Date;
    publisher: { id: string; name: string | null; image: string | null };
    versions: {
        id: number;
        icon: string;
        createdAt: Date;
        externals: External[];
    }[];
}

function toGameResponse(game: GameRow, urls: UrlConfig): GameResponse | null {
    const latest = game.versions[0];
    if (!latest) {
        return null;
    }
    const contentBaseUrl = `${urls.publicContentBaseUrl}/${latest.id}`;
    return {
        id: game.id,
        title: game.title,
        description: game.description,
        credit: game.credit,
        iconUrl: `${contentBaseUrl}/${latest.icon}`,
        pageUrl: `${urls.publicBaseUrl}/game/${game.id}/`,
        publisher: {
            id: game.publisher.id,
            name: game.publisher.name ?? "",
            iconUrl: game.publisher.image,
        },
        contentId: latest.id,
        contentJsonUrl: `${urls.publicApiBaseUrl}/v1/games/${game.id}/content.json`,
        licenseUrl: `${contentBaseUrl}/library_license.txt`,
        externals: latest.externals.map(({ name, required }) => ({
            name,
            required,
        })),
        streaming: game.streaming,
        playCount: game.playCount,
        createdAt: game.createdAt.toISOString(),
        updatedAt: latest.createdAt.toISOString(),
    };
}

function escapeLike(text: string) {
    return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function searchGames(
    prisma: PrismaClient,
    { q, supported, sort, page, limit }: SearchParams,
    urls: UrlConfig,
) {
    const pattern = q ? `%${escapeLike(q)}%` : null;
    const supportedOrNull = supported ?? null;
    // 必須プラグインの絞り込みは最新バージョンとの結合が要り、Prisma のクエリでは書けないため
    // ID だけを SQL で絞り込み、詳細は findMany で取る
    const rows = await prisma.$queryRaw<{ id: number }[]>`
        SELECT g.id
        FROM "Game" g
        JOIN LATERAL (
            SELECT c.id, c."createdAt"
            FROM "Content" c
            WHERE c."gameId" = g.id
            ORDER BY c.id DESC
            LIMIT 1
        ) latest ON true
        WHERE g."externalLaunch"
            AND (
                ${pattern}::text IS NULL
                OR g.title ILIKE ${pattern}
                OR g.description ILIKE ${pattern}
            )
            AND (
                ${supportedOrNull}::text[] IS NULL
                OR NOT EXISTS (
                    SELECT 1
                    FROM "ContentExternal" ce
                    WHERE ce."contentId" = latest.id
                        AND ce.required
                        AND ce.name <> ALL(${supportedOrNull}::text[])
                )
            )
        ORDER BY
            CASE WHEN ${sort}::text = 'popular' THEN g."playCount" END DESC NULLS LAST,
            CASE WHEN ${sort}::text = 'updated' THEN latest."createdAt" END DESC NULLS LAST,
            g.id DESC
        LIMIT ${limit + 1}
        OFFSET ${page * limit}
    `;
    const ids = rows.slice(0, limit).map(({ id }) => id);
    const games = await prisma.game.findMany({
        // ID を絞った後に許可を取り消されたゲームを、差し替え後のバージョンで返さないよう確かめ直す
        where: { id: { in: ids }, externalLaunch: true },
        select: gameSelect,
    });
    const gameById = new Map(games.map((game) => [game.id, game]));
    return {
        items: ids
            .map((id) => gameById.get(id))
            .filter((game) => game != null)
            .map((game) => toGameResponse(game, urls))
            .filter((game) => game != null),
        page,
        limit,
        hasNext: rows.length > limit,
    };
}

export async function getGame(
    prisma: PrismaClient,
    gameId: number,
    urls: UrlConfig,
) {
    const game = await prisma.game.findFirst({
        where: { id: gameId, externalLaunch: true },
        select: gameSelect,
    });
    return game ? toGameResponse(game, urls) : null;
}

export function toContentJson(game: GameResponse, urls: UrlConfig) {
    const contentBaseUrl = `${urls.publicContentBaseUrl}/${game.contentId}`;
    return {
        content_id: game.contentId,
        content_url: `${contentBaseUrl}/game.json`,
        asset_base_url: contentBaseUrl,
        engine_urls: [],
        external: game.externals.map(({ name }) => name),
        untrusted: false,
    } satisfies ContentJson;
}
