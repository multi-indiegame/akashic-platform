"use server";

import { headers } from "next/headers";
import { prisma } from "@multi-indiegame/persist-schema";
import { GUEST_NAME, PLAY_CHAT_BODY_MAX, PLAY_CHAT_NAME_MAX } from "../types";
import {
    archivePlayChatMessage,
    authorizePlayChat,
    checkPlayChatRateLimit,
} from "./play-chat";

export type PlayChatFormState = {
    ok: boolean;
    message?: string;
    submitted: boolean;
    submittedAt?: number;
};

function failure(message: string): PlayChatFormState {
    return {
        ok: false,
        message,
        submitted: true,
        submittedAt: Date.now(),
    };
}

export async function postPlayChatAction(
    prevState: PlayChatFormState,
    formData: FormData,
): Promise<PlayChatFormState> {
    const playId = parseInt(formData.get("playId")?.toString() ?? "");
    const body = formData.get("body")?.toString().trim();
    const requestedName = formData.get("authorName")?.toString().trim();

    if (
        !Number.isSafeInteger(playId) ||
        !body ||
        body.length > PLAY_CHAT_BODY_MAX ||
        (requestedName && requestedName.length > PLAY_CHAT_NAME_MAX)
    ) {
        return failure("入力内容を確認してください。");
    }

    const auth = await authorizePlayChat(playId);
    if (!auth.ok) {
        switch (auth.reason) {
            case "Disabled":
                return failure("この部屋ではチャットが無効です。");
            case "NotFound":
                return failure("この部屋は終了しています。");
            case "Forbidden":
            default:
                return failure(
                    "この部屋のチャットに投稿する権限がありません。画面を更新して入室し直してください。",
                );
        }
    }

    const { user } = auth;
    const authorId = user.authType === "oauth" ? user.id : undefined;
    const guestId = user.authType === "guest" ? user.id : undefined;
    const authorName =
        user.authType === "oauth" ? user.name : requestedName || GUEST_NAME;

    const rateLimit = await checkPlayChatRateLimit(playId, {
        userId: authorId,
        guestId,
    });
    if (!rateLimit.ok) {
        return failure(
            `投稿が多すぎます。${rateLimit.retryAfterSeconds} 秒ほど待ってから再度投稿してください。`,
        );
    }

    const requestHeaders = await headers();
    try {
        await archivePlayChatMessage({
            playId,
            authorName,
            userId: authorId,
            guestId,
            ip:
                requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                undefined,
            userAgent: requestHeaders.get("user-agent") ?? undefined,
            body,
            postedAt: new Date(),
        });
    } catch (err) {
        console.warn("failed to archive play chat message to S3", err);
        return failure(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }

    await prisma.playChatMessage.create({
        data: {
            playId,
            authorId,
            authorName,
            guestId,
            body,
        },
    });

    return {
        ok: true,
        submitted: true,
        submittedAt: Date.now(),
    };
}
