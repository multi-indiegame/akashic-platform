import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@multi-indiegame/persist-schema";
import { getS3Client } from "./content-utils";

const TTL_MINUTES = parseInt(process.env.BOARD_MESSAGE_TTL_MINUTES ?? "30");
const SHORT_WINDOW_SECONDS = parseInt(
    process.env.BOARD_RATE_SHORT_WINDOW_SECONDS ?? "30",
);
const SHORT_MAX = parseInt(process.env.BOARD_RATE_SHORT_MAX ?? "10");
const MEDIUM_WINDOW_SECONDS = parseInt(
    process.env.BOARD_RATE_MEDIUM_WINDOW_SECONDS ?? "600",
);
const MEDIUM_MAX = parseInt(process.env.BOARD_RATE_MEDIUM_MAX ?? "60");
const GLOBAL_PER_MINUTE = parseInt(
    process.env.BOARD_RATE_GLOBAL_PER_MINUTE ?? "60",
);

export function boardMessageCutoff(now = Date.now()) {
    return new Date(now - TTL_MINUTES * 60 * 1000);
}

type BoardMessageWhere = {
    authorId?: string;
    guestId?: string;
};

async function checkWindow(
    where: BoardMessageWhere | undefined,
    windowSeconds: number,
    max: number,
) {
    const now = Date.now();
    const recent = await prisma.boardMessage.findMany({
        where: {
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
    | { ok: true }
    | { ok: false; retryAfterSeconds: number };

export async function checkBoardRateLimit(keys: {
    userId?: string;
    guestId?: string;
}): Promise<RateLimitResult> {
    const checks: Promise<number | undefined>[] = [
        checkWindow(undefined, 60, GLOBAL_PER_MINUTE),
    ];
    if (keys.userId) {
        checks.push(
            checkWindow(
                { authorId: keys.userId },
                SHORT_WINDOW_SECONDS,
                SHORT_MAX,
            ),
            checkWindow(
                { authorId: keys.userId },
                MEDIUM_WINDOW_SECONDS,
                MEDIUM_MAX,
            ),
        );
    } else if (keys.guestId) {
        checks.push(
            checkWindow(
                { guestId: keys.guestId },
                SHORT_WINDOW_SECONDS,
                SHORT_MAX,
            ),
            checkWindow(
                { guestId: keys.guestId },
                MEDIUM_WINDOW_SECONDS,
                MEDIUM_MAX,
            ),
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

export interface BoardMessageArchiveRecord {
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

export async function archiveBoardMessage(record: BoardMessageArchiveRecord) {
    const iso = record.postedAt.toISOString();
    const [datePart] = iso.split("T");
    const [yyyy, mm, dd] = datePart.split("-");
    const key = `${auditKeyPrefix}board-messages/${yyyy}/${mm}/${dd}/${iso.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: getAuditBucket(),
            Key: key,
            Body: JSON.stringify(record),
            ContentType: "application/json",
        }),
    );
}

export async function cleanupExpiredBoardMessages() {
    // レート制限判定に使う行を消さないよう、保持期間は判定ウィンドウ以上とする。
    const retentionMs =
        Math.max(TTL_MINUTES * 60, MEDIUM_WINDOW_SECONDS, 60) * 1000;
    await prisma.boardMessage.deleteMany({
        where: {
            createdAt: { lt: new Date(Date.now() - retentionMs) },
        },
    });
}
