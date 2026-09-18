"use server";

import { prisma } from "@multi-indiegame/persist-schema";
import { isWriteBlocked } from "./drain-state";
import { getSignedInUser } from "./auth";

const favoriteToggleErrReasons = [
    "AlreadyExists",
    "NotFound",
    "Unauthorized",
    "InternalError",
    "Drain",
] as const;
type FavoriteToggleErrorType = (typeof favoriteToggleErrReasons)[number];

type FavoriteToggleResponse =
    | { ok: true }
    | { ok: false; reason: FavoriteToggleErrorType };

export async function addFavorite(
    gameId: number,
): Promise<FavoriteToggleResponse> {
    if (isWriteBlocked()) {
        return {
            ok: false,
            reason: "Drain",
        };
    }
    // Server Action はブラウザ外から任意の引数で呼べるため、userId はクライアントから
    // 受け取らずセッションから決める
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return {
            ok: false,
            reason: auth.reason,
        };
    }
    const userId = auth.user.id;
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
    // Server Action はブラウザ外から任意の引数で呼べるため、userId はクライアントから
    // 受け取らずセッションから決める
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return {
            ok: false,
            reason: auth.reason,
        };
    }
    const userId = auth.user.id;
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
