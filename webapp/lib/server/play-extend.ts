"use server";

import { prisma } from "@multi-indiegame/persist-schema";
import { akashicServerUrl, withAkashicServerAuth } from "./akashic";
import { isWriteBlocked } from "./drain-state";
import { getAuth } from "./auth";
import { checkPlayAccess } from "./play-access-token";
import { isBannedFromPlay } from "./ban";
import { sessionViewerId } from "./viewer-identity";

const errReasons = [
    "InvalidParams",
    "Drain",
    "InternalError",
    "NotFound",
    "Forbidden",
] as const;
export type ExtendPlayErrorType = (typeof errReasons)[number];

export type ExtendPlayResponse =
    | {
          ok: true;
          remainingMs: number;
          expiresAt: number;
          extendMs: number;
      }
    | {
          ok: false;
          reason: ExtendPlayErrorType | "TooEarly";
          remainingMs?: number;
          expiresAt?: number;
      };

/**
 * 部屋主が延長を忘れても参加者がフォローできるよう、部屋主に限らず入室済みの参加者なら
 * 誰でも延長できる。部屋 ID は連番で推測できるため、入室していない第三者や BAN
 * された視聴者には延長させない
 */
export async function extendPlay({
    playId: rawPlayId,
}: {
    playId: string;
}): Promise<ExtendPlayResponse> {
    if (isWriteBlocked()) {
        return {
            ok: false,
            reason: "Drain",
        };
    }
    const playId = Number(rawPlayId);
    if (!Number.isSafeInteger(playId) || playId <= 0) {
        return {
            ok: false,
            reason: "InvalidParams",
        };
    }
    try {
        const play = await prisma.play.findUnique({
            where: { id: playId },
            select: { id: true, isActive: true, gmUserId: true },
        });
        if (!play || !play.isActive) {
            return { ok: false, reason: "NotFound" };
        }
        const user = await getAuth();
        if (!user) {
            return { ok: false, reason: "Forbidden" };
        }
        // 入室審査 (限定部屋の合言葉・招待リンク、BAN) を通過した証明として、
        // 入室時に発行したアクセス Cookie で参加者か判定する (チャットと同じ)
        const access = await checkPlayAccess(play.id, sessionViewerId(user));
        if (!access.ok) {
            return { ok: false, reason: "Forbidden" };
        }
        // 入室ガードをすり抜けた古い Cookie でも延長させない
        if (
            await isBannedFromPlay(user, {
                id: play.id,
                gmUserId: play.gmUserId,
            })
        ) {
            return { ok: false, reason: "Forbidden" };
        }
        const res = await fetch(`${akashicServerUrl}/extend`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...withAkashicServerAuth(),
            },
            body: JSON.stringify({ playId: `${play.id}` }),
        });
        if (res.status === 404) {
            return { ok: false, reason: "NotFound" };
        }
        const json = await res.json();
        if (res.status === 409) {
            return json as ExtendPlayResponse;
        }
        if (res.status !== 200) {
            return { ok: false, reason: "InternalError" };
        }
        return json as ExtendPlayResponse;
    } catch (err) {
        console.warn('failed to extend. (playId = "%s")', playId, err);
        return { ok: false, reason: "InternalError" };
    }
}
