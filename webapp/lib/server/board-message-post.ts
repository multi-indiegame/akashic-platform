"use server";

import { headers } from "next/headers";
import { prisma } from "@multi-indiegame/persist-schema";
import {
    BOARD_MESSAGE_BODY_MAX,
    BOARD_MESSAGE_NAME_MAX,
    GUEST_NAME,
} from "../types";
import { getAuth } from "./auth";
import {
    archiveBoardMessage,
    checkBoardRateLimit,
    cleanupExpiredBoardMessages,
} from "./board-message";

export type BoardMessageFormState = {
    ok: boolean;
    message?: string;
    submitted: boolean;
    submittedAt?: number;
};

function failure(message: string): BoardMessageFormState {
    return {
        ok: false,
        message,
        submitted: true,
        submittedAt: Date.now(),
    };
}

export async function postBoardMessageAction(
    prevState: BoardMessageFormState,
    formData: FormData,
): Promise<BoardMessageFormState> {
    const body = formData.get("body")?.toString().trim();
    const requestedName = formData.get("authorName")?.toString().trim();

    if (
        !body ||
        body.length > BOARD_MESSAGE_BODY_MAX ||
        (requestedName && requestedName.length > BOARD_MESSAGE_NAME_MAX)
    ) {
        return failure("入力内容を確認してください。");
    }

    const user = await getAuth();
    if (!user) {
        console.warn("failed to resolve user for board message post");
        return failure(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }
    const authorId = user.authType === "oauth" ? user.id : undefined;
    const guestId = user.authType === "guest" ? user.id : undefined;
    const authorName =
        user.authType === "oauth" ? user.name : requestedName || GUEST_NAME;

    const rateLimit = await checkBoardRateLimit({
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
        await archiveBoardMessage({
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
        console.warn("failed to archive board message to S3", err);
        return failure(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }

    await prisma.boardMessage.create({
        data: {
            authorId,
            authorName,
            guestId,
            body,
        },
    });

    try {
        await cleanupExpiredBoardMessages();
    } catch (err) {
        console.warn("failed to cleanup expired board messages", err);
    }

    return {
        ok: true,
        submitted: true,
        submittedAt: Date.now(),
    };
}
