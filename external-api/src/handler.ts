import type {
    APIGatewayProxyEventV2,
    APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
// WHY: パッケージの入口は読み込んだ時点で接続数を絞らない既定のクライアントを作るため、それを含まない入口から読む
import { createPrismaClient } from "@multi-indiegame/persist-schema/dist/client";
import {
    publicApiBaseUrl,
    publicBaseUrl,
    publicContentBaseUrl,
} from "./config";
import { getGame, searchGames, toContentsJson, UrlConfig } from "./games";
import { parseGameId, parseSearchParams } from "./params";
import type { ErrorReason } from "./types";

// WHY: 予約済み同時実行数と掛け合わせた数が DB への最大接続数になるため、1 本に絞る
const prisma = createPrismaClient({ maxConnections: 1 });

const gamePathPattern = /^\/v1\/games\/([^/]+)$/;
const contentsJsonPathPattern = /^\/v1\/games\/([^/]+)\/contents\.json$/;

function json(
    statusCode: number,
    body: unknown,
    cacheable: boolean,
): APIGatewayProxyStructuredResultV2 {
    return {
        statusCode,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": cacheable ? "public, max-age=60" : "no-store",
        },
        body: JSON.stringify(body),
    };
}

function error(statusCode: number, reason: ErrorReason) {
    return json(statusCode, { reason }, statusCode === 404);
}

function urlConfig(event: APIGatewayProxyEventV2): UrlConfig {
    return {
        publicBaseUrl,
        publicContentBaseUrl,
        publicApiBaseUrl:
            publicApiBaseUrl ?? `https://${event.requestContext.domainName}`,
    };
}

async function route(event: APIGatewayProxyEventV2) {
    if (event.requestContext.http.method !== "GET") {
        return error(404, "NotFound");
    }
    const path = event.rawPath;
    const urls = urlConfig(event);

    if (path === "/v1/games") {
        const params = parseSearchParams(event.queryStringParameters ?? {});
        if (!params) {
            return error(400, "InvalidParams");
        }
        return json(200, await searchGames(prisma, params, urls), true);
    }

    const gameMatch = gamePathPattern.exec(path);
    const contentsJsonMatch = contentsJsonPathPattern.exec(path);
    const idText = gameMatch?.[1] ?? contentsJsonMatch?.[1];
    if (idText == null) {
        return error(404, "NotFound");
    }
    const gameId = parseGameId(idText);
    if (gameId == null) {
        return error(400, "InvalidParams");
    }
    const game = await getGame(prisma, gameId, urls);
    if (!game) {
        return error(404, "NotFound");
    }
    return json(
        200,
        contentsJsonMatch ? toContentsJson(game, urls) : game,
        true,
    );
}

export async function handler(
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
    try {
        return await route(event);
    } catch (err) {
        console.error(
            'failed to handle request (path = "%s")',
            event.rawPath,
            err,
        );
        return error(500, "InternalError");
    }
}
