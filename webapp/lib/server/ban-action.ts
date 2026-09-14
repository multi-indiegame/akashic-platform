"use server";

import { prisma } from "@yasshi2525/persist-schema";
import { getAuth } from "./auth";
import { BAN_LIMIT, BanScope, buildBanLabel, countGmBans } from "./ban";
import { archiveBanRequest } from "./ban-audit";
import { applyBanChange } from "./ban-broadcast";
import { cookies, headers } from "next/headers";
import {
    isSameViewer,
    roomOwnerViewer,
    targetViewer,
    verifyRoomOwner,
} from "./viewer-identity";
import { playOwnerCookieName } from "./play-owner-token";

export type BanFormState = {
    ok: boolean;
    message?: string;
    submitted: boolean;
    submittedAt?: number;
};

function failure(message: string): BanFormState {
    return { ok: false, message, submitted: true, submittedAt: Date.now() };
}

function success(): BanFormState {
    return { ok: true, submitted: true, submittedAt: Date.now() };
}

/**
 * 部屋主が、自分の部屋のチャット発言者をBAN (BAN) する。
 * サインイン部屋主は自分の全部屋、ゲスト部屋主はその部屋のみに効く。
 */
export async function banFromChatAction(
    prevState: BanFormState,
    formData: FormData,
): Promise<BanFormState> {
    const playId = parseInt(formData.get("playId")?.toString() ?? "");
    const messageId = parseInt(formData.get("messageId")?.toString() ?? "");
    if (!Number.isSafeInteger(playId) || !Number.isSafeInteger(messageId)) {
        return failure("入力内容を確認してください。");
    }

    const user = await getAuth();
    if (!user) {
        return failure("ページを更新してから再度お試しください。");
    }

    const play = await prisma.play.findUnique({
        where: { id: playId },
        select: { id: true, gameMasterId: true, gmUserId: true },
    });
    if (!play) {
        return failure("部屋が見つかりませんでした。");
    }
    // 部屋主本人だけがBANできる。ゲスト部屋主は公開される guest_id では偽造できて
    // しまうため、作成時に発行した署名 Cookie で本人確認する（OAuth はセッション）
    const ownerToken = (await cookies()).get(
        playOwnerCookieName(play.id),
    )?.value;
    if (!verifyRoomOwner(play, user, ownerToken)) {
        return failure("この部屋の部屋主のみがBANできます。");
    }

    const message = await prisma.playChatMessage.findUnique({
        where: { id: messageId },
        select: {
            playId: true,
            authorId: true,
            authorName: true,
            guestId: true,
            body: true,
        },
    });
    if (!message || message.playId !== playId) {
        return failure("対象の発言が見つかりませんでした。");
    }
    if (!message.authorId && !message.guestId) {
        return failure("この発言者はBANできません。");
    }

    const target = message.authorId
        ? { targetUserId: message.authorId }
        : { targetGuestId: message.guestId };
    const viewer = targetViewer(message);
    // 部屋主は BAN の対象にしない。発行できるのも部屋主だけなので、自分自身への
    // BAN として案内する
    if (
        isSameViewer(message, user) ||
        isSameViewer(message, roomOwnerViewer(play))
    ) {
        return failure("自分自身はBANできません。");
    }
    const requestHeaders = await headers();

    // サインイン部屋主は全部屋 (playId=null)、ゲスト部屋主はこの部屋のみ
    const scope: BanScope =
        user.authType === "oauth"
            ? { gmUserId: user.id, playId: null }
            : { gmGuestId: user.id, playId: play.id };

    const existing = await prisma.ban.findFirst({
        where: { ...scope, ...target, origin: "MANUAL" },
        select: { id: true },
    });
    // 上限超過は監査ログより先に判定する。あとで弾く順序にすると、BAN 行を
    // 作らずに終わる要求が applied: true として記録されてしまう
    if (
        !existing &&
        user.authType === "oauth" &&
        (await countGmBans(user.id)) >= BAN_LIMIT
    ) {
        // ゲスト部屋主の BAN は解除 UI が無く部屋終了で消えるため上限の対象外
        return failure(
            `BAN は ${BAN_LIMIT} 件までです。モデレーション設定から不要なものを解除してください。`,
        );
    }
    // 監査ログを先に書く。書けないまま BAN すると後から調査できなくなるため、
    // 失敗したら BAN せずエラーを返す（チャット投稿と同じ audit-first 方針）
    try {
        await archiveBanRequest({
            playId: play.id,
            source: "CHAT",
            action: "BAN",
            gmUserId: "gmUserId" in scope ? scope.gmUserId : undefined,
            gmGuestId: "gmGuestId" in scope ? scope.gmGuestId : undefined,
            targetUserId: message.authorId ?? undefined,
            targetGuestId: message.guestId ?? undefined,
            applied: !existing,
            ip:
                requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                undefined,
            userAgent: requestHeaders.get("user-agent") ?? undefined,
            requestedAt: new Date(),
        });
    } catch (err) {
        console.warn("failed to archive ban request to S3", err);
        return failure(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }
    if (!existing) {
        try {
            await prisma.ban.create({
                data: {
                    ...scope,
                    ...target,
                    labelSnapshot: buildBanLabel(
                        message.authorName,
                        message.body,
                    ),
                },
            });
        } catch (err) {
            // 並走した BAN 発行が同一 BAN を先に作ると unique 制約違反(P2002)に
            // なる。既に BAN 済みなので冪等に成功扱いにし、下の kick へ進む
            const isDuplicate =
                typeof err === "object" &&
                err !== null &&
                "code" in err &&
                err.code === "P2002";
            if (!isDuplicate) {
                console.warn("failed to create ban", err);
                return failure(
                    "予期しないエラーが発生しました。時間をおいてリトライしてください。",
                );
            }
        }
    }

    if (viewer) {
        await applyBanChange({ scope, target: viewer, action: "banned" });
    }

    return success();
}

export async function unbanAction(
    prevState: BanFormState,
    formData: FormData,
): Promise<BanFormState> {
    const banId = parseInt(formData.get("banId")?.toString() ?? "");
    if (!Number.isSafeInteger(banId)) {
        return failure("入力内容を確認してください。");
    }
    const user = await getAuth();
    if (!user) {
        return failure("ページを更新してから再度お試しください。");
    }
    // ゲスト部屋主の guest_id は in-game で公開され偽造できるため、解除は
    // サインイン部屋主に限定する（ゲスト BAN は解除 UI が無く部屋終了で自動失効）
    if (user.authType !== "oauth") {
        return failure("サインインが必要です。");
    }
    // 自分が発行した BAN のみ解除できる
    const ban = await prisma.ban.findFirst({
        where: { id: banId, gmUserId: user.id },
        select: { id: true, targetUserId: true, targetGuestId: true },
    });
    if (!ban) {
        return failure("対象のBANが見つかりませんでした。");
    }
    const requestHeaders = await headers();
    try {
        await archiveBanRequest({
            source: "SETTINGS",
            action: "UNBAN",
            gmUserId: user.id,
            targetUserId: ban.targetUserId ?? undefined,
            targetGuestId: ban.targetGuestId ?? undefined,
            applied: true,
            ip:
                requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                undefined,
            userAgent: requestHeaders.get("user-agent") ?? undefined,
            requestedAt: new Date(),
        });
    } catch (err) {
        console.warn("failed to archive unban request to S3", err);
        return failure(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }
    const { count } = await prisma.ban.deleteMany({
        where: { id: ban.id, gmUserId: user.id },
    });
    if (count === 0) {
        return failure("対象のBANが見つかりませんでした。");
    }
    const viewer = targetViewer({
        authorId: ban.targetUserId,
        guestId: ban.targetGuestId,
    });
    if (viewer) {
        // 同じ相手に MANUAL と VIA_BLOCK の行が並ぶことがあり、一覧では別行として
        // 見える。片方だけ消して unbanned を配ると、入室ガードは残った行で拒否し
        // 続けるのにコンテンツは進行へ戻してしまう。
        // VIA_BLOCK を作る経路はまだ無いが、後から足すときのために先に置く
        const remaining = await prisma.ban.findFirst({
            where: {
                gmUserId: user.id,
                targetUserId: ban.targetUserId,
                targetGuestId: ban.targetGuestId,
            },
            select: { id: true },
        });
        if (!remaining) {
            await applyBanChange({
                scope: { gmUserId: user.id, playId: null },
                target: viewer,
                action: "unbanned",
            });
        }
    }
    return success();
}
