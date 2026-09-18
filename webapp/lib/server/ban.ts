import { prisma } from "@multi-indiegame/persist-schema";
import { BAN_LIMIT_DEFAULT, type User } from "../types";

const LABEL_BODY_MAX = 40;

export const BAN_LIMIT = parseInt(
    process.env.BAN_LIMIT ?? `${BAN_LIMIT_DEFAULT}`,
);

/** BAN の発行スコープ。サインイン部屋主は全部屋、ゲスト部屋主は部屋単位。 */
export type BanScope =
    | { gmUserId: string; playId: null }
    | { gmGuestId: string; playId: number };

/**
 * 上限判定用の、サインイン部屋主の全 BAN 件数。
 * ゲスト部屋主の BAN は解除 UI が無く部屋終了で消えるため上限の対象外。
 * 永続して増えるのはサインイン部屋主の BAN (playId=null) だけなので、
 * こちらのみ数える。
 */
export async function countGmBans(gmUserId: string): Promise<number> {
    return prisma.ban.count({ where: { gmUserId } });
}

export interface BanTarget {
    targetUserId?: string;
    targetGuestId?: string;
}

/** 視聴者を BAN 判定・PlaySession 照合に使う識別子へ落とす */
export function viewerKey(user: User): { viewerId: string } & BanTarget {
    if (user.authType === "oauth") {
        return { viewerId: user.id, targetUserId: user.id };
    }
    return { viewerId: user.id, targetGuestId: user.id };
}

/**
 * 視聴者がこの部屋から BAN されているか判定する。
 * サインイン部屋主の BAN はその部屋主の全部屋 (gmUserId) に、ゲスト部屋主の
 * BAN はその部屋のみ (playId) に効く。
 */
export async function isBannedFromPlay(
    user: User | null,
    play: { id: number; gmUserId: string | null },
): Promise<boolean> {
    if (!user) {
        return false;
    }
    const key = viewerKey(user);
    const target = key.targetUserId
        ? { targetUserId: key.targetUserId }
        : { targetGuestId: key.targetGuestId };
    const scope: { gmUserId?: string; playId?: number }[] = [
        { playId: play.id },
    ];
    if (play.gmUserId) {
        scope.push({ gmUserId: play.gmUserId });
    }
    const ban = await prisma.ban.findFirst({
        where: { ...target, OR: scope },
        select: { id: true },
    });
    return !!ban;
}

export function buildBanLabel(authorName: string, body: string) {
    const excerpt = body.trim().replace(/\s+/g, " ").slice(0, LABEL_BODY_MAX);
    return excerpt ? `${authorName}: ${excerpt}` : authorName;
}
