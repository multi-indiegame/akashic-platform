import process from "node:process";
// WHY: パッケージの入口は読み込んだ時点で webapp 用の既定のクライアントを作るため、それを含まない入口から読む
import {
    createPrismaClient,
    type PrismaClient,
} from "@multi-indiegame/persist-schema/client";
import { resolveDatabaseUrl } from "./database-url";

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
export function getPrisma(): Promise<PrismaClient> {
    clientPromise ??= connect().catch((err) => {
        clientPromise = undefined;
        throw err;
    });
    return clientPromise;
}
