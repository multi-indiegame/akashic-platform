"use server";

import { prisma } from "@multi-indiegame/persist-schema";
import { getAuth } from "./auth";
import { buildLabelSnapshot, countMutes, MUTE_LIMIT } from "./mute";
import { authorizePlayChat } from "./play-chat";
import {
    decodeSubjectToken,
    guestSubjectKey,
    resolveSubjectTargets,
    subjectDisplayName,
    viewerSubjectKey,
} from "./score-subject";

export type MuteFormState = {
    ok: boolean;
    message?: string;
    submitted: boolean;
    submittedAt?: number;
};

function failure(message: string): MuteFormState {
    return {
        ok: false,
        message,
        submitted: true,
        submittedAt: Date.now(),
    };
}

function success(): MuteFormState {
    return {
        ok: true,
        submitted: true,
        submittedAt: Date.now(),
    };
}

async function findMessage(source: string, messageId: number) {
    if (source === "board") {
        return await prisma.boardMessage.findUnique({
            where: { id: messageId },
            select: {
                authorId: true,
                authorName: true,
                guestId: true,
                body: true,
            },
        });
    }
    if (source === "chat") {
        return await prisma.playChatMessage.findUnique({
            where: { id: messageId },
            select: {
                authorId: true,
                authorName: true,
                guestId: true,
                body: true,
                playId: true,
            },
        });
    }
    return null;
}

type FoundMessage = NonNullable<Awaited<ReturnType<typeof findMessage>>>;

/**
 * 部屋チャットの発言をミュート対象にする前に、その部屋の閲覧権を確認する。
 * 確認を省くと、連番の messageId を推測するだけで、合言葉つき限定部屋の
 * 発言者名・本文冒頭を labelSnapshot 経由で抜き取れてしまう。
 */
async function canAccessMessage(
    source: string,
    message: FoundMessage,
): Promise<boolean> {
    if (source !== "chat") {
        return true;
    }
    const playId = (message as { playId?: number }).playId;
    if (playId == null) {
        return false;
    }
    return (await authorizePlayChat(playId)).ok;
}

/**
 * ミュート対象は匿名キーではなく投稿 ID で受け取る。匿名キーは閲覧者ごとに
 * 異なるハッシュで逆算できないため、サーバー側は投稿から投稿者を引き直す。
 */
export async function muteAuthorAction(
    prevState: MuteFormState,
    formData: FormData,
): Promise<MuteFormState> {
    const source = formData.get("source")?.toString() ?? "";
    const messageId = parseInt(formData.get("messageId")?.toString() ?? "");
    if (!Number.isSafeInteger(messageId)) {
        return failure("入力内容を確認してください。");
    }

    const user = await getAuth();
    if (user?.authType !== "oauth") {
        return failure("ミュートの保存にはサインインが必要です。");
    }

    const message = await findMessage(source, messageId);
    if (!message) {
        return failure("対象の投稿が見つかりませんでした。");
    }
    if (!(await canAccessMessage(source, message))) {
        return failure("対象の投稿が見つかりませんでした。");
    }
    if (!message.authorId && !message.guestId) {
        return failure("この投稿はミュートできません。");
    }
    if (message.authorId === user.id) {
        return failure("自分自身はミュートできません。");
    }

    if ((await countMutes(user.id)) >= MUTE_LIMIT) {
        return failure(
            `ミュートは ${MUTE_LIMIT} 件までです。設定画面から不要なものを解除してください。`,
        );
    }

    const target = message.authorId
        ? { targetUserId: message.authorId }
        : { targetGuestId: message.guestId };
    const existing = await prisma.mute.findFirst({
        where: { ownerId: user.id, ...target },
        select: { id: true },
    });
    if (existing) {
        return success();
    }

    try {
        await prisma.mute.create({
            data: {
                ownerId: user.id,
                ...target,
                labelSnapshot: buildLabelSnapshot(
                    message.authorName,
                    message.body,
                ),
            },
        });
    } catch (err) {
        console.warn("failed to create mute", err);
        return failure(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }
    return success();
}

/**
 * 投稿からミュートを解除する。解除画面と違い muteId を持たないため、
 * 登録時と同じく投稿から投稿者を引き直して対象を特定する。
 */
export async function unmuteAuthorAction(
    prevState: MuteFormState,
    formData: FormData,
): Promise<MuteFormState> {
    const source = formData.get("source")?.toString() ?? "";
    const messageId = parseInt(formData.get("messageId")?.toString() ?? "");
    if (!Number.isSafeInteger(messageId)) {
        return failure("入力内容を確認してください。");
    }

    const user = await getAuth();
    if (user?.authType !== "oauth") {
        return failure("サインインが必要です。");
    }

    const message = await findMessage(source, messageId);
    if (!message) {
        return failure("対象の投稿が見つかりませんでした。");
    }
    // 作者削除済み（onDelete: SetNull）で authorId/guestId が両方 null だと
    // { targetGuestId: null } になり、対サインインユーザーのミュートを一括削除
    // してしまう。対象を特定できないので登録側と同様に弾く
    if (!message.authorId && !message.guestId) {
        return failure("対象の投稿が見つかりませんでした。");
    }
    const target = message.authorId
        ? { targetUserId: message.authorId }
        : { targetGuestId: message.guestId };
    await prisma.mute.deleteMany({
        where: { ownerId: user.id, ...target },
    });
    return success();
}

/**
 * 統計のランキングに載った相手を解決する。ミュートは部屋チャットと同じ
 * 相手（userId か guest_id）に付けるので、どちらで付けても両方に効く。
 */
async function findScoreSubject(formData: FormData) {
    const gameId = parseInt(formData.get("gameId")?.toString() ?? "");
    const subjectKey = decodeSubjectToken(
        formData.get("subject")?.toString() ?? "",
    );
    if (!Number.isSafeInteger(gameId) || !subjectKey) {
        return null;
    }
    const target = (await resolveSubjectTargets([subjectKey])).get(subjectKey);
    return { gameId, subjectKey, target };
}

export async function muteScoreSubjectAction(
    prevState: MuteFormState,
    formData: FormData,
): Promise<MuteFormState> {
    const user = await getAuth();
    if (user?.authType !== "oauth") {
        return failure("ミュートの保存にはサインインが必要です。");
    }

    const found = await findScoreSubject(formData);
    if (!found) {
        return failure("入力内容を確認してください。");
    }
    if (found.subjectKey === viewerSubjectKey(user)) {
        return failure("自分自身はミュートできません。");
    }
    const [name, game] = await Promise.all([
        subjectDisplayName(found.subjectKey),
        prisma.game.findUnique({
            where: { id: found.gameId },
            select: { title: true },
        }),
    ]);
    if (!name || !game) {
        return failure("対象が見つかりませんでした。");
    }
    if (!found.target) {
        return failure("この相手はミュートできません。");
    }

    if ((await countMutes(user.id)) >= MUTE_LIMIT) {
        return failure(
            `ミュートは ${MUTE_LIMIT} 件までです。設定画面から不要なものを解除してください。`,
        );
    }

    const target = found.target.authorId
        ? { targetUserId: found.target.authorId }
        : { targetGuestId: found.target.guestId };
    const existing = await prisma.mute.findFirst({
        where: { ownerId: user.id, ...target },
        select: { id: true },
    });
    if (existing) {
        return success();
    }

    try {
        await prisma.mute.create({
            data: {
                ownerId: user.id,
                ...target,
                labelSnapshot: buildLabelSnapshot(
                    name,
                    `「${game.title}」の統計`,
                ),
            },
        });
    } catch (err) {
        console.warn("failed to create mute", err);
        return failure(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }
    return success();
}

export async function unmuteScoreSubjectAction(
    prevState: MuteFormState,
    formData: FormData,
): Promise<MuteFormState> {
    const user = await getAuth();
    if (user?.authType !== "oauth") {
        return failure("サインインが必要です。");
    }

    const subjectKey = decodeSubjectToken(
        formData.get("subject")?.toString() ?? "",
    );
    if (!subjectKey) {
        return failure("入力内容を確認してください。");
    }
    if (subjectKey.startsWith("u:")) {
        await prisma.mute.deleteMany({
            where: { ownerId: user.id, targetUserId: subjectKey.slice(2) },
        });
        return success();
    }
    // WHY: 参加の記録が消えて guest_id を引けない相手でも、ミュート一覧の
    // guest_id から派生させれば突き合わせられる。表示側の判定と揃える
    const guestMutes = await prisma.mute.findMany({
        where: { ownerId: user.id, targetGuestId: { not: null } },
        select: { id: true, targetGuestId: true },
    });
    const ids = guestMutes
        .filter((mute) => guestSubjectKey(mute.targetGuestId!) === subjectKey)
        .map((mute) => mute.id);
    if (ids.length > 0) {
        await prisma.mute.deleteMany({
            where: { ownerId: user.id, id: { in: ids } },
        });
    }
    return success();
}

export async function unmuteAction(
    prevState: MuteFormState,
    formData: FormData,
): Promise<MuteFormState> {
    const muteId = parseInt(formData.get("muteId")?.toString() ?? "");
    if (!Number.isSafeInteger(muteId)) {
        return failure("入力内容を確認してください。");
    }

    const user = await getAuth();
    if (user?.authType !== "oauth") {
        return failure("サインインが必要です。");
    }

    // 他人のミュートを消せないよう ownerId も条件に含める
    const { count } = await prisma.mute.deleteMany({
        where: { id: muteId, ownerId: user.id },
    });
    if (count === 0) {
        return failure("対象のミュートが見つかりませんでした。");
    }
    return success();
}
