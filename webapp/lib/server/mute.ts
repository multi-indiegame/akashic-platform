import { prisma } from "@multi-indiegame/persist-schema";
import { MUTE_LABEL_BODY_MAX, MUTE_LIMIT_DEFAULT, type User } from "../types";

export const MUTE_LIMIT = parseInt(
    process.env.MUTE_LIMIT ?? `${MUTE_LIMIT_DEFAULT}`,
);

export interface MuteSubject {
    authorId?: string | null;
    guestId?: string | null;
}

export interface MuteSet {
    userIds: Set<string>;
    guestIds: Set<string>;
}

export function emptyMuteSet(): MuteSet {
    return { userIds: new Set(), guestIds: new Set() };
}

/**
 * サインイン利用者のミュート一覧。未サインイン利用者のミュートは端末内
 * (localStorage) にあり、サーバーからは参照できないため空集合を返す。
 */
export async function getMuteSet(user: User | null): Promise<MuteSet> {
    if (user?.authType !== "oauth") {
        return emptyMuteSet();
    }
    const mutes = await prisma.mute.findMany({
        where: { ownerId: user.id },
        select: { targetUserId: true, targetGuestId: true },
    });
    const set = emptyMuteSet();
    for (const mute of mutes) {
        if (mute.targetUserId) {
            set.userIds.add(mute.targetUserId);
        }
        if (mute.targetGuestId) {
            set.guestIds.add(mute.targetGuestId);
        }
    }
    return set;
}

export function isMuted(set: MuteSet, subject: MuteSubject) {
    if (subject.authorId) {
        return set.userIds.has(subject.authorId);
    }
    if (subject.guestId) {
        return set.guestIds.has(subject.guestId);
    }
    return false;
}

export function buildLabelSnapshot(authorName: string, body: string) {
    const excerpt = body
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, MUTE_LABEL_BODY_MAX);
    return `${authorName}: ${excerpt}`;
}

export async function countMutes(ownerId: string) {
    return await prisma.mute.count({ where: { ownerId } });
}
