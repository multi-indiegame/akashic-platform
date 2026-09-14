import { User } from "../types";
import { verifyPlayOwnerToken } from "./play-owner-token";

/**
 * 閲覧者と投稿者が同一人物か、認証種別を含めて判定する。
 *
 * ゲストは guest_id cookie を任意の値（公開されている他人の OAuth user id 等）に
 * 設定できるため、生の id 一致だけで比べると別人を自分自身と誤認する。authType は
 * next-auth のセッション検証由来で詐称できないので、これを名前空間として使い、
 * oauth 閲覧者は authorId のみ、guest 閲覧者は guestId のみと突き合わせる。
 */
export function isSameViewer(
    subject: { authorId?: string | null; guestId?: string | null },
    viewer: Pick<User, "authType" | "id"> | null | undefined,
): boolean {
    if (!viewer) {
        return false;
    }
    if (viewer.authType === "oauth") {
        return !!subject.authorId && subject.authorId === viewer.id;
    }
    return !!subject.guestId && subject.guestId === viewer.id;
}

/**
 * 視聴者がこの部屋の部屋主(GM)本人かを判定する。詐称できない資格で確かめるのが要点：
 * - OAuth 部屋主（`gmUserId` あり）… next-auth セッションは詐称不能なので authType＋id 一致で足りる。
 * - ゲスト部屋主（`gmUserId` なし）… gameMasterId(=guest_id) は in-game playerId として
 *   参加者に公開されるため生 id 比較では偽造できる。作成時に本人へ発行した署名 Cookie
 *   （`ownerToken`）を検証する。
 */
export function verifyRoomOwner(
    play: { id: number; gameMasterId: string; gmUserId: string | null },
    viewer: Pick<User, "authType" | "id"> | null | undefined,
    ownerToken: string | undefined,
): boolean {
    if (!viewer) {
        return false;
    }
    if (play.gmUserId) {
        return viewer.authType === "oauth" && viewer.id === play.gmUserId;
    }
    return (
        viewer.authType === "guest" &&
        verifyPlayOwnerToken(ownerToken, play.id, play.gameMasterId)
    );
}

/**
 * 部屋主の視聴者としての identity。BAN の対象判定に使う。
 *
 * WHY: verifyRoomOwner は資格（ゲストは署名 Cookie）で本人確認するため、要求者の
 * guest_id が gameMasterId と一致するとは限らない。「部屋主を BAN できない」を
 * 要求者との一致で代用すると、その食い違いで部屋主本人を対象にできてしまう。
 */
export function roomOwnerViewer(play: {
    gameMasterId: string;
    gmUserId: string | null;
}): Pick<User, "authType" | "id"> {
    return play.gmUserId
        ? { authType: "oauth", id: play.gmUserId }
        : { authType: "guest", id: play.gameMasterId };
}

/**
 * PlaySession に記録する視聴者識別子。認証種別を接頭辞にして名前空間を分け、
 * ゲストが他人の id を騙っても別ユーザーの session と衝突しないようにする。
 */
export function sessionViewerId(viewer: Pick<User, "authType" | "id">): string {
    return `${viewer.authType}:${viewer.id}`;
}

/**
 * BAN 対象（authorId か guestId のどちらか）を、認証種別付きの視聴者へ落とす。
 * oauth 投稿者は authorId、ゲスト投稿者は guestId を使う。
 */
export function targetViewer(target: {
    authorId?: string | null;
    guestId?: string | null;
}): Pick<User, "authType" | "id"> | null {
    if (target.authorId) {
        return { authType: "oauth", id: target.authorId };
    }
    if (target.guestId) {
        return { authType: "guest", id: target.guestId };
    }
    return null;
}

/**
 * BAN 対象（authorId か guestId のどちらか）から、sessionViewerId と同形式の
 * kick 用識別子を導く。
 */
export function targetSessionViewerId(target: {
    authorId?: string | null;
    guestId?: string | null;
}): string | null {
    const viewer = targetViewer(target);
    return viewer ? sessionViewerId(viewer) : null;
}

/** sessionViewerId を認証種別と id に戻す */
export function parseSessionViewerId(
    viewerId: string,
): Pick<User, "authType" | "id"> | null {
    const separator = viewerId.indexOf(":");
    if (separator < 0) {
        return null;
    }
    const authType = viewerId.slice(0, separator);
    const id = viewerId.slice(separator + 1);
    if (!id || (authType !== "oauth" && authType !== "guest")) {
        return null;
    }
    return { authType, id };
}
