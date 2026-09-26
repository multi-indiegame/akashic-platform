"use server";

import { prisma } from "@multi-indiegame/persist-schema";
import { revokeSubject } from "@multi-indiegame/scoreboard-schema";
import { getSignedInUser } from "./auth";
import { isWriteBlocked } from "./drain-state";
import { logSafe } from "./log-safe";

export type ScoreboardSettingResponse =
    | { ok: true }
    | { ok: false; reason: "Unauthorized" | "InternalError" | "Drain" };

/**
 * 共有ページを公開するかを切り替える。
 *
 * WHY: 既定はオフ。名前掲載の同意はゲーム単位の掲載への同意であって、
 * 横断プロフィールの公開は別途必要。
 */
export async function setScoreboardPublic(
    isPublic: boolean,
): Promise<ScoreboardSettingResponse> {
    if (isWriteBlocked()) {
        return { ok: false, reason: "Drain" };
    }
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return { ok: false, reason: auth.reason };
    }
    try {
        await prisma.user.update({
            where: { id: auth.user.id },
            data: { scoreboardPublic: isPublic },
        });
        return { ok: true };
    } catch (err) {
        console.warn(
            "failed to update scoreboard visibility (userId = %s)",
            logSafe(auth.user.id),
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}

/**
 * 統計への掲載をやめる。
 *
 * 記録そのものは消さず、掲載用から外して名前が出ない状態へ戻す。称号も消える。
 *
 * **以後のプレイも掲載しない。** 掲載を再開したいときは {@link resumeScoreboardPublication} を呼ぶ。
 */
export async function revokeScoreboardPublication(): Promise<ScoreboardSettingResponse> {
    if (isWriteBlocked()) {
        return { ok: false, reason: "Drain" };
    }
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return { ok: false, reason: auth.reason };
    }
    try {
        const userId = auth.user.id;
        await prisma.$transaction(async (tx) => {
            // WHY: 利用者の行を先に更新して押さえる。突き合わせと称号の付与は
            // 同じ行を押さえてから書くので、消した後に書き戻されない
            await tx.user.update({
                where: { id: userId },
                data: { scoreboardPublic: false, scoreboardOptOut: true },
            });
            await revokeSubject(`u:${userId}`, tx);
            await tx.scoreTitle.deleteMany({ where: { userId } });
        });
        return { ok: true };
    } catch (err) {
        console.warn(
            "failed to revoke scoreboard publication (userId = %s)",
            logSafe(auth.user.id),
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}

/**
 * 統計への掲載を再開する。
 *
 * これから遊ぶ分が掲載されるようになる。**やめる前の記録は戻らない。**
 * 掲載用の集計は消えており、生の記録から積み直すこともしない。
 */
export async function resumeScoreboardPublication(): Promise<ScoreboardSettingResponse> {
    if (isWriteBlocked()) {
        return { ok: false, reason: "Drain" };
    }
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return { ok: false, reason: auth.reason };
    }
    try {
        await prisma.user.update({
            where: { id: auth.user.id },
            data: { scoreboardOptOut: false },
        });
        return { ok: true };
    } catch (err) {
        console.warn(
            "failed to resume scoreboard publication (userId = %s)",
            logSafe(auth.user.id),
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}
