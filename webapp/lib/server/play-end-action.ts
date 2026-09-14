"use server";

import { prisma } from "@yasshi2525/persist-schema";
import { cookies } from "next/headers";
import { getAuth } from "./auth";
import { endPlay } from "./play-end";
import { playOwnerCookieName } from "./play-owner-token";
import { verifyRoomOwner } from "./viewer-identity";

const errReasons = [
    "InvalidParams",
    "NotFound",
    "Forbidden",
    "InternalError",
] as const;
type EndPlayErrorType = (typeof errReasons)[number];
export type EndPlayResponse =
    { ok: true } | { ok: false; reason: EndPlayErrorType };

/** 部屋主が自分の部屋を閉じる */
export async function endPlayAction({
    playId: rawPlayId,
}: {
    playId: string;
}): Promise<EndPlayResponse> {
    const playId = Number(rawPlayId);
    if (!Number.isSafeInteger(playId) || playId <= 0) {
        return { ok: false, reason: "InvalidParams" };
    }
    try {
        const play = await prisma.play.findUnique({
            where: { id: playId },
            select: { id: true, gameMasterId: true, gmUserId: true },
        });
        if (!play) {
            return { ok: false, reason: "NotFound" };
        }
        // 部屋主本人だけが閉じられる。ゲスト部屋主の gameMasterId は参加者に公開されるため、
        // 作成時に発行した署名 Cookie で本人確認する（OAuth はセッション）
        const user = await getAuth();
        const ownerToken = (await cookies()).get(
            playOwnerCookieName(play.id),
        )?.value;
        if (!verifyRoomOwner(play, user, ownerToken)) {
            return { ok: false, reason: "Forbidden" };
        }
        if (!(await endPlay({ playId: `${play.id}`, reason: "GAMEMASTER" }))) {
            return { ok: false, reason: "InternalError" };
        }
        return { ok: true };
    } catch (err) {
        console.warn('failed to end play. (playId = "%s")', playId, err);
        return { ok: false, reason: "InternalError" };
    }
}
