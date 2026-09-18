"use server";

import { prisma } from "@multi-indiegame/persist-schema";
import {
    CONTACT_BODY_MAX,
    CONTACT_NAME_MAX,
    ContactFormState,
    GUEST_NAME,
} from "../types";
import { getAuth } from "./auth";
import { notifyAdmin } from "./mail";
import { checkContactRateLimit } from "./contact";

function failure(message: string): ContactFormState {
    return { ok: false, message, submitted: true, submittedAt: Date.now() };
}

// 明らかな誤入力だけ弾く。厳密な検証はしない（返信は best-effort）
function looksLikeEmail(value: string) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

export async function submitContactAction(
    prevState: ContactFormState,
    formData: FormData,
): Promise<ContactFormState> {
    const body = formData.get("body")?.toString().trim();
    const inputName = formData.get("name")?.toString().trim();
    const replyEmail =
        formData.get("replyEmail")?.toString().trim() || undefined;

    if (
        !body ||
        body.length > CONTACT_BODY_MAX ||
        (inputName && inputName.length > CONTACT_NAME_MAX) ||
        (replyEmail && !looksLikeEmail(replyEmail))
    ) {
        return failure("入力内容を確認してください。");
    }

    const user = await getAuth();
    // サインイン済みでもメールアドレスは自動取得しない（本人が任意入力）
    const senderId = user?.authType === "oauth" ? user.id : undefined;
    const senderGuestId = user?.authType === "guest" ? user.id : undefined;
    const name =
        user?.authType === "oauth" ? user.name : inputName || GUEST_NAME;

    // DB 挿入・メール送信の前に、flood で DB や SES クォータを溶かされないよう絞る
    const rate = await checkContactRateLimit({ senderId, senderGuestId });
    if (!rate.ok) {
        return failure(
            `送信が続いています。${rate.retryAfterSeconds} 秒ほど待ってから再度お試しください。`,
        );
    }

    let contact;
    try {
        contact = await prisma.contactMessage.create({
            data: {
                name,
                replyEmail,
                body,
                senderId,
                senderGuestId,
            },
        });
    } catch (err) {
        console.warn("failed to create contact message", err);
        return failure(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }

    await notifyAdmin({
        subject: `[問い合わせ] #${contact.id} ${name}`,
        replyTo: replyEmail,
        body: [
            `問い合わせID: ${contact.id}`,
            `名前: ${name}`,
            `返信先: ${replyEmail ?? "(未入力)"}`,
            `送信者: ${senderId ? `user:${senderId}` : senderGuestId ? `guest:${senderGuestId}` : "(不明)"}`,
            "",
            body,
        ].join("\n"),
    });

    return { ok: true, submitted: true, submittedAt: Date.now() };
}
