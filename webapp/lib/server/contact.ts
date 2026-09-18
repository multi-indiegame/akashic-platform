import { prisma } from "@multi-indiegame/persist-schema";

// 匿名でも送れるフォームなので、まずは全体レートでfloodを止める。
// 送信者を特定できる場合はさらに送信者単位でも絞る。
const GLOBAL_WINDOW_SECONDS = parseInt(
    process.env.CONTACT_RATE_GLOBAL_WINDOW_SECONDS ?? "60",
);
const GLOBAL_MAX = parseInt(process.env.CONTACT_RATE_GLOBAL_MAX ?? "20");
const SENDER_WINDOW_SECONDS = parseInt(
    process.env.CONTACT_RATE_SENDER_WINDOW_SECONDS ?? "3600",
);
const SENDER_MAX = parseInt(process.env.CONTACT_RATE_SENDER_MAX ?? "5");

type SenderKeys = { senderId?: string; senderGuestId?: string };

async function checkWindow(
    where: SenderKeys | undefined,
    windowSeconds: number,
    max: number,
) {
    const now = Date.now();
    const recent = await prisma.contactMessage.findMany({
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

export type ContactRateResult =
    | { ok: true }
    | { ok: false; retryAfterSeconds: number };

export async function checkContactRateLimit(
    keys: SenderKeys,
): Promise<ContactRateResult> {
    const checks: Promise<number | undefined>[] = [
        checkWindow(undefined, GLOBAL_WINDOW_SECONDS, GLOBAL_MAX),
    ];
    const sender = keys.senderId
        ? { senderId: keys.senderId }
        : keys.senderGuestId
          ? { senderGuestId: keys.senderGuestId }
          : undefined;
    if (sender) {
        checks.push(checkWindow(sender, SENDER_WINDOW_SECONDS, SENDER_MAX));
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
