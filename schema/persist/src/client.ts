import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

export type { PrismaClient };

/**
 * WHY: Lambda は同時実行の数だけ接続を張るため、1 つあたりの接続数を絞れるようにする。
 * 接続文字列は、環境変数ではなく SSM Parameter Store から取得して渡す場合がある
 */
export function createPrismaClient(options?: {
    maxConnections?: number;
    connectionString?: string;
}) {
    const adapter = new PrismaPg({
        connectionString:
            options?.connectionString ?? `${process.env.DATABASE_URL}`,
        max: options?.maxConnections,
    });
    return new PrismaClient({ adapter });
}
