"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@multi-indiegame/persist-schema";
import { GUEST_NAME } from "../types";
import { getAuth } from "./auth";
import { publicBaseUrl } from "./akashic";

export type FeedbackFormState = {
    ok: boolean;
    message?: string;
    submitted: boolean;
    submittedAt?: number;
};

const initialState: FeedbackFormState = {
    ok: true,
    submitted: false,
};

function toNumber(value: FormDataEntryValue | null) {
    if (value == null) return undefined;
    const parsed = parseInt(value.toString(), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export async function postFeedbackAction(
    prevState: FeedbackFormState,
    formData: FormData,
): Promise<FeedbackFormState> {
    const gameId = toNumber(formData.get("gameId"));
    const body = formData.get("body")?.toString();
    const authorName = formData.get("authorName")?.toString();

    if (gameId == null || !body) {
        return {
            ok: false,
            message: "入力内容を確認してください。",
            submitted: true,
            submittedAt: Date.now(),
        };
    }

    const user = await getAuth();

    const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: {
            id: true,
            title: true,
            publisherId: true,
            versions: {
                take: 1,
                select: { id: true, icon: true },
                orderBy: { id: "desc" },
            },
        },
    });
    if (!game) {
        return {
            ok: false,
            message: "ゲームが見つかりません。",
            submitted: true,
            submittedAt: Date.now(),
        };
    }

    const resolvedAuthorName =
        user?.authType === "oauth" ? user.name : authorName || GUEST_NAME;

    if (!resolvedAuthorName) {
        return {
            ok: false,
            message: "表示名を入力してください。",
            submitted: true,
            submittedAt: Date.now(),
        };
    }

    const post = await prisma.feedbackPost.create({
        data: {
            gameId,
            authorId: user?.authType === "oauth" ? user.id : undefined,
            authorName: resolvedAuthorName,
            body,
        },
    });

    if (game.publisherId !== (user?.authType === "oauth" ? user.id : null)) {
        await prisma.notification.create({
            data: {
                userId: game.publisherId,
                unread: true,
                type: "FEEDBACKED",
                iconURL: `${publicBaseUrl}/api/game/${gameId}/icon`,
                body: `"${game.title}" に新しいフィードバックが届きました。`,
                link: `/game/${gameId}#post-${post.id}`,
            },
        });
    }

    revalidatePath(`/game/${gameId}`);
    return {
        ...initialState,
        submitted: true,
        submittedAt: Date.now(),
    };
}

export async function postFeedbackReplyAction(
    prevState: FeedbackFormState,
    formData: FormData,
): Promise<FeedbackFormState> {
    const postId = toNumber(formData.get("postId"));
    const body = formData.get("body")?.toString();

    if (postId == null || !body) {
        return {
            ok: false,
            message: "入力内容を確認してください。",
            submitted: true,
            submittedAt: Date.now(),
        };
    }

    const user = await getAuth();
    if (!user || user.authType !== "oauth") {
        return {
            ok: false,
            message: "返信にはサインインが必要です。",
            submitted: true,
            submittedAt: Date.now(),
        };
    }

    const post = await prisma.feedbackPost.findUnique({
        where: { id: postId },
        select: {
            id: true,
            authorId: true,
            reply: { select: { id: true } },
            game: {
                select: {
                    id: true,
                    title: true,
                    publisherId: true,
                    versions: {
                        take: 1,
                        select: { id: true, icon: true },
                        orderBy: { id: "desc" },
                    },
                },
            },
        },
    });
    if (!post) {
        return {
            ok: false,
            message: "フィードバックが見つかりません。",
            submitted: true,
            submittedAt: Date.now(),
        };
    }
    if (post.game.publisherId !== user.id) {
        return {
            ok: false,
            message: "返信する権限がありません。",
            submitted: true,
            submittedAt: Date.now(),
        };
    }
    if (post.reply) {
        return {
            ok: false,
            message: "返信済みです。",
            submitted: true,
            submittedAt: Date.now(),
        };
    }

    await prisma.feedbackReply.create({
        data: {
            postId: post.id,
            authorId: user.id,
            body,
        },
    });

    if (post.authorId && post.authorId !== user.id) {
        await prisma.notification.create({
            data: {
                userId: post.authorId,
                unread: true,
                type: "FEEDBACK_REPLIED",
                iconURL: `${publicBaseUrl}/api/game/${post.game.id}/icon`,
                body: `"${post.game.title}" のフィードバックに返信がありました。`,
                link: `/game/${post.game.id}#post-${post.id}`,
            },
        });
    }

    revalidatePath(`/game/${post.game.id}`);
    return {
        ...initialState,
        submitted: true,
        submittedAt: Date.now(),
    };
}
