import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@multi-indiegame/persist-schema";
import { getS3Client } from "./content-utils";
import { getAuth } from "./auth";
import { checkPlayAccess } from "./play-access-token";
import { isBannedFromPlay } from "./ban";
import { sessionViewerId } from "./viewer-identity";

const SHORT_WINDOW_SECONDS = parseInt(
    process.env.PLAY_CHAT_RATE_SHORT_WINDOW_SECONDS ?? "10",
);
const SHORT_MAX = parseInt(process.env.PLAY_CHAT_RATE_SHORT_MAX ?? "5");
const MEDIUM_WINDOW_SECONDS = parseInt(
    process.env.PLAY_CHAT_RATE_MEDIUM_WINDOW_SECONDS ?? "60",
);
const MEDIUM_MAX = parseInt(process.env.PLAY_CHAT_RATE_MEDIUM_MAX ?? "20");
const ROOM_PER_MINUTE = parseInt(
    process.env.PLAY_CHAT_RATE_ROOM_PER_MINUTE ?? "120",
);

export const PLAY_CHAT_FETCH_LIMIT = parseInt(
    process.env.PLAY_CHAT_FETCH_LIMIT ?? "200",
);

export type PlayChatDenial = "NotFound" | "Disabled" | "Forbidden";

/**
 * 部屋チャットの閲覧・投稿可否を判定する。入室審査を通ったことの証明は
 * 入室時に発行したアクセス Cookie で確認し、合言葉自体は受け取らない。
 */
export async function authorizePlayChat(playId: number): Promise<
    | {
          ok: true;
          user: NonNullable<Awaited<ReturnType<typeof getAuth>>>;
          needsRenew: boolean;
          gameMasterId: string;
          gmUserId: string | null;
          gameId: number;
      }
    | { ok: false; reason: PlayChatDenial }
> {
    const play = await prisma.play.findUnique({
        where: { id: playId },
        select: {
            id: true,
            isActive: true,
            chatEnabled: true,
            gameMasterId: true,
            gmUserId: true,
            content: { select: { gameId: true } },
        },
    });
    if (!play) {
        return { ok: false, reason: "NotFound" };
    }
    if (!play.chatEnabled) {
        return { ok: false, reason: "Disabled" };
    }
    if (!play.isActive) {
        return { ok: false, reason: "NotFound" };
    }
    const user = await getAuth();
    if (!user) {
        return { ok: false, reason: "Forbidden" };
    }
    const access = await checkPlayAccess(playId, sessionViewerId(user));
    if (!access.ok) {
        return { ok: false, reason: "Forbidden" };
    }
    // 入室ガードをすり抜けた古い Cookie でも投稿させない
    if (
        await isBannedFromPlay(user, { id: play.id, gmUserId: play.gmUserId })
    ) {
        return { ok: false, reason: "Forbidden" };
    }
    return {
        ok: true,
        user,
        needsRenew: access.needsRenew,
        gameMasterId: play.gameMasterId,
        gmUserId: play.gmUserId,
        gameId: play.content.gameId,
    };
}

type PlayChatWhere = {
    authorId?: string;
    guestId?: string;
};

async function checkWindow(
    playId: number,
    where: PlayChatWhere | undefined,
    windowSeconds: number,
    max: number,
) {
    const now = Date.now();
    const recent = await prisma.playChatMessage.findMany({
        where: {
            playId,
            ...where,
            createdAt: { gte: new Date(now - windowSeconds * 1000) },
        },
        orderBy: { createdAt: "desc" },
        take: max,
        select: { createdAt: true },
    });
    if (recent.length < max) {
        return undefined;
    }
    const oldest = recent[recent.length - 1];
    return Math.max(
        1,
        Math.ceil(
            (oldest.createdAt.getTime() + windowSeconds * 1000 - now) / 1000,
        ),
    );
}

export type RateLimitResult =
    { ok: true } | { ok: false; retryAfterSeconds: number };

export async function checkPlayChatRateLimit(
    playId: number,
    keys: { userId?: string; guestId?: string },
): Promise<RateLimitResult> {
    const poster = keys.userId
        ? { authorId: keys.userId }
        : keys.guestId
          ? { guestId: keys.guestId }
          : undefined;
    const checks: Promise<number | undefined>[] = [
        checkWindow(playId, undefined, 60, ROOM_PER_MINUTE),
    ];
    if (poster) {
        checks.push(
            checkWindow(playId, poster, SHORT_WINDOW_SECONDS, SHORT_MAX),
            checkWindow(playId, poster, MEDIUM_WINDOW_SECONDS, MEDIUM_MAX),
        );
    }
    const results = await Promise.all(checks);
    const retryAfterSeconds = results.reduce<number | undefined>(
        (acc, cur) =>
            cur == null ? acc : acc == null ? cur : Math.max(acc, cur),
        undefined,
    );
    if (retryAfterSeconds != null) {
        return { ok: false, retryAfterSeconds };
    }
    return { ok: true };
}

export interface PlayChatArchiveRecord {
    playId: number;
    authorName: string;
    userId?: string;
    guestId?: string;
    ip?: string;
    userAgent?: string;
    body: string;
    postedAt: Date;
}

function getAuditBucket() {
    if (!process.env.S3_AUDIT_BUCKET) {
        throw new Error("S3_AUDIT_BUCKET is required.");
    }
    return process.env.S3_AUDIT_BUCKET;
}

const auditKeyPrefix = process.env.S3_AUDIT_KEY_PREFIX ?? "";

export async function archivePlayChatMessage(record: PlayChatArchiveRecord) {
    const iso = record.postedAt.toISOString();
    const [datePart] = iso.split("T");
    const [yyyy, mm, dd] = datePart.split("-");
    const key = `${auditKeyPrefix}play-chat-messages/${yyyy}/${mm}/${dd}/${record.playId}/${iso.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: getAuditBucket(),
            Key: key,
            Body: JSON.stringify(record),
            ContentType: "application/json",
        }),
    );
}
