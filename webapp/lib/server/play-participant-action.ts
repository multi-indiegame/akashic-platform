"use server";

import { prisma } from "@multi-indiegame/persist-schema";
import { reconcilePlay } from "@multi-indiegame/scoreboard-schema";
import { getAuth } from "./auth";
import { isWriteBlocked } from "./drain-state";
import { gamePlayerId } from "./game-player-id";
import { logSafe } from "./log-safe";

// 名前取得ダイアログの入力欄と同じ上限。掲載時にレイアウトが壊れない長さに抑える
const GUEST_NAME_MAX_LENGTH = 16;

const nameConsentErrReasons = [
    "InvalidParams",
    "NotFound",
    "Unauthorized",
    "InternalError",
    "Drain",
] as const;
type NameConsentErrorType = (typeof nameConsentErrReasons)[number];

export type NameConsentResponse =
    { ok: true } | { ok: false; reason: NameConsentErrorType };

/**
 * 名前取得プラグインで解決した「統計への掲載に同意したか」を控える。
 *
 * WHY: 同意はブラウザにしか現れず、実行基盤からは見えない。実行基盤に同意という
 * 概念を持ち込まないため、報告を受けるのは webapp だけにする。記録の掲載可否は、
 * 実行基盤が集めた記録とこの控えを突き合わせて決める。
 *
 * 名前取得は1プレイ中に何度でも呼ばれるため、呼ばれるたびに上書きして最後に
 * 確定した状態だけを残す。同意しなかった報告も同じように上書きする。
 */
export async function reportNameConsent(
    playId: number,
    accepted: boolean,
    name: string,
): Promise<NameConsentResponse> {
    if (isWriteBlocked()) {
        return { ok: false, reason: "Drain" };
    }
    if (!Number.isSafeInteger(playId)) {
        return { ok: false, reason: "InvalidParams" };
    }
    // Server Action はブラウザ外から任意の引数で呼べるため、誰の同意かは
    // クライアントから受け取らずセッションから決める
    const user = await getAuth();
    if (!user) {
        return { ok: false, reason: "Unauthorized" };
    }
    const playerId = gamePlayerId(user);
    // サインイン利用者の表示名は掲載のたび User.name を引くので控えない。
    // ゲストは追従先が無いため、同意したときだけ自称の名前を控える
    const guestName =
        accepted && user.authType === "guest"
            ? name.trim().slice(0, GUEST_NAME_MAX_LENGTH) || null
            : null;
    try {
        // 入室時に作った行だけを更新する。作りに行かないことで、その部屋に
        // 居ない相手の同意が生まれないようにする
        const updated = await prisma.playParticipant.updateMany({
            where: { playId, playerId },
            data: { nameConsent: accepted, guestName },
        });
        if (updated.count === 0) {
            return { ok: false, reason: "NotFound" };
        }
        // WHY: プレイ中の報告なら、まだ記録が無いので何も起きない。プレイが
        // 終わった後に届いた報告は、ここで拾って掲載用へ反映する
        await reconcilePlay(playId);
        return { ok: true };
    } catch (err) {
        console.warn(
            "failed to report name consent (playId = %s, playerId = %s)",
            logSafe(playId),
            logSafe(playerId),
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}
