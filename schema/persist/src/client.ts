import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

const connectionString = `${process.env.DATABASE_URL}`;

/**
 * WHY: Lambda は同時実行の数だけ接続を張るため、1 つあたりの接続数を絞れるようにする
 */
export function createPrismaClient(options?: { maxConnections?: number }) {
    const adapter = new PrismaPg({
        connectionString,
        max: options?.maxConnections,
    });
    return new PrismaClient({ adapter });
}
