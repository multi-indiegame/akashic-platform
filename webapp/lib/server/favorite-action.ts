"use server";

import { prisma } from "@yasshi2525/persist-schema";
import { isWriteBlocked } from "./drain-state";
import { getAuth } from "./auth";

const favoriteToggleErrReasons = [
    "AlreadyExists",
    "NotFound",
    "Unauthorized",
    "InternalError",
    "Drain",
] as const;
type FavoriteToggleErrorType = (typeof favoriteToggleErrReasons)[number];

type FavoriteToggleResponse =
    { ok: true } | { ok: false; reason: FavoriteToggleErrorType };

// Server Action はブラウザ外から任意の引数で呼べるため、userId はクライアントから
// 受け取らずセッションから決める。ゲストは guest_id cookie を他人の OAuth id に
// 偽装できるので OAuth セッションに限る
async function getSignedInUserId() {
    const user = await getAuth();
    return user?.authType === "oauth" ? user.id : undefined;
}

export async function addFavorite(
    gameId: number,
): Promise<FavoriteToggleResponse> {
    if (isWriteBlocked()) {
        return {
            ok: false,
            reason: "Drain",
        };
    }
    const userId = await getSignedInUserId();
    if (!userId) {
        return {
            ok: false,
            reason: "Unauthorized",
        };
    }
    try {
        const existing = await prisma.favorite.findUnique({
            where: {
                userId_gameId: {
                    userId,
                    gameId,
                },
            },
            select: { id: true },
        });
        if (existing) {
            return {
                ok: false,
                reason: "AlreadyExists",
            };
        }
        await prisma.favorite.create({
            data: {
                userId,
                gameId,
            },
        });
        return {
            ok: true,
        };
    } catch (err) {
        console.warn(
            "failed to add favorite (userId = %s, gameId = %s)",
            userId,
            gameId,
            err,
        );
        return {
            ok: false,
            reason: "InternalError",
        };
    }
}

export async function deleteFavorite(
    gameId: number,
): Promise<FavoriteToggleResponse> {
    if (isWriteBlocked()) {
        return {
            ok: false,
            reason: "Drain",
        };
    }
    const userId = await getSignedInUserId();
    if (!userId) {
        return {
            ok: false,
            reason: "Unauthorized",
        };
    }
    try {
        const deleted = await prisma.favorite.delete({
            where: {
                userId_gameId: {
                    userId,
                    gameId,
                },
            },
        });
        if (!deleted) {
            return {
                ok: false,
                reason: "NotFound",
            };
        }
        return {
            ok: true,
        };
    } catch (err) {
        console.warn(
            "failed to delete favorite (userId = %s, gameId = %s)",
            userId,
            gameId,
            err,
        );
        return {
            ok: false,
            reason: "InternalError",
        };
    }
}
