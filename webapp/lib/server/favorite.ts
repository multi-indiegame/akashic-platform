import { prisma } from "@yasshi2525/persist-schema";
import { User } from "../types";

// user を引数で受け取るため Server Action ("use server") にしてはならない。
// クライアントから任意の user を渡され、他人のお気に入りを読まれてしまう
export async function isFavorited(
    user: User | null,
    gameId: number,
): Promise<boolean> {
    if (!user || user.authType === "guest") {
        return false;
    }
    try {
        const favorite = await prisma.favorite.findUnique({
            where: {
                userId_gameId: {
                    userId: user.id,
                    gameId,
                },
            },
            select: { id: true },
        });
        return !!favorite;
    } catch (err) {
        console.warn(
            "failed to check favorite (userId = %s, gameId = %s)",
            user.id,
            gameId,
            err,
        );
        return false;
    }
}

export async function getFavoriteList(user: User | null, gameIds: number[]) {
    if (!user || user.authType === "guest") {
        return [];
    }
    try {
        const favorites = await prisma.favorite.findMany({
            where: {
                userId: user.id,
                gameId: {
                    in: gameIds,
                },
            },
            select: {
                gameId: true,
            },
        });
        return favorites.map((f) => f.gameId);
    } catch (err) {
        console.warn("failed to get favorite list (userId = %s)", user.id, err);
        return [];
    }
}
