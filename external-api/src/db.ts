import process from "node:process";
import { createPrismaClient } from "@multi-indiegame/persist-schema";
import { resolveDatabaseUrl } from "./database-url";

type PrismaClient = ReturnType<typeof createPrismaClient>;

let clientPromise: Promise<PrismaClient> | undefined;

async function connect() {
    return createPrismaClient({
        // WHY: 予約済み同時実行数と掛け合わせた数が DB への最大接続数になるため、1 本に絞る
        maxConnections: 1,
        connectionString: await resolveDatabaseUrl(process.env),
    });
}

/**
 * 実行環境ごとに 1 つのクライアントを使い回す。
 * 接続文字列の取得に失敗した場合は、次のリクエストで取り直す
 */
export function getPrisma() {
    clientPromise ??= connect().catch((err) => {
        clientPromise = undefined;
        throw err;
    });
    return clientPromise;
}
