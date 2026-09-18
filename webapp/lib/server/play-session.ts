import { prisma } from "@multi-indiegame/persist-schema";

/**
 * この視聴者がこの部屋で既に発行済みの playToken があれば返す。入室 GET は
 * revalidation でも呼ばれるが、クライアントはマウント時の token を使い続けるため
 * 毎回新規発行すると使われない token が累積し、BAN 時の kick 対象を絞れなくなる。
 * 既存 token を再利用して視聴者あたり実質1件に保つ（storage の token は消費されず
 * 部屋の寿命まで有効なので再利用できる）。
 */
export async function findPlaySessionToken(
    playId: number,
    viewerId: string,
): Promise<string | null> {
    const session = await prisma.playSession.findFirst({
        where: { playId, viewerId },
        orderBy: { id: "desc" },
        select: { playToken: true },
    });
    return session?.playToken ?? null;
}

/**
 * 入室時に視聴者へ発行した playToken を記録する。BAN 時に対象の socket を
 * 即時切断するためのハンドルになる。部屋終了時に akashic-server 側で削除する。
 * 記録に失敗すると追跡・kick 不能な token を渡すことになるため、握りつぶさず
 * 例外を伝播させ、呼び出し側（入室ルート）で token を返さず入室を失敗に倒す。
 */
export async function recordPlaySession(
    playId: number,
    viewerId: string,
    playToken: string,
) {
    await prisma.playSession.create({
        data: { playId, viewerId, playToken },
    });
}
