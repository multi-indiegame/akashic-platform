import { prisma } from "@multi-indiegame/persist-schema";

export type TransactionClient = Parameters<
    Parameters<typeof prisma.$transaction>[0]
>[0];

/**
 * 掲載をやめているかを、利用者の行を押さえたうえで読む。
 *
 * WHY: 掲載をやめる処理も同じ行を更新してから掲載用を消す。行を押さえずに
 * 読むと、やめる処理が消し終えた後に、やめる前に読んだ判定で書き戻してしまう
 */
export async function lockOptOut(
    tx: TransactionClient,
    userId: string,
): Promise<boolean> {
    const rows = await tx.$queryRaw<{ scoreboardOptOut: boolean }[]>`
        SELECT "scoreboardOptOut" FROM "User" WHERE "id" = ${userId} FOR UPDATE
    `;
    return rows[0]?.scoreboardOptOut ?? false;
}
