import { OAuthUser } from "../types";
import { getGuest } from "./auth-guest";
import { auth } from "./auth-next";

// 読み取り専用・nullable。Server Component を含めどの経路からでも呼べる。
// guest_id は proxy が全リクエストの入口で発行するため、実運用では
// 通常ゲストが載り非 null になる（型は保証しないので呼び出し側で null を扱う）。
export async function getAuth() {
    const session = await auth();
    if (session?.user?.id && session.user.name) {
        return {
            id: session.user.id,
            name: session.user.name,
            image: session.user.image ?? undefined,
            authType: "oauth",
        } satisfies OAuthUser;
    }
    return await getGuest();
}

/**
 * 書き込み系 Server Action 用に、OAuth でサインイン中の本人を返す。
 * ゲストは guest_id cookie を他人の OAuth id に偽装できるため本人とみなさない。
 * セッション取得の一時障害で例外のままクライアントへ投げると、呼び出し側 UI が
 * 処理中のまま固まるため、失敗は InternalError として値で返す。
 */
export async function getSignedInUser(): Promise<
    | { ok: true; user: OAuthUser }
    | { ok: false; reason: "Unauthorized" | "InternalError" }
> {
    try {
        const user = await getAuth();
        if (user?.authType !== "oauth") {
            return { ok: false, reason: "Unauthorized" };
        }
        return { ok: true, user };
    } catch (err) {
        console.warn("failed to get auth", err);
        return { ok: false, reason: "InternalError" };
    }
}
