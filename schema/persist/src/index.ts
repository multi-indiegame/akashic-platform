import { createPrismaClient } from "./client";

const prisma = createPrismaClient();

export * from "./generated/browser";
export { createPrismaClient, prisma };
