import { createHmac } from "node:crypto";
import { prisma } from "@yasshi2525/persist-schema";
import { User } from "../types";
import { parseSessionViewerId } from "./viewer-identity";

/**
 * ゲーム（Akashic）に申告する in-game playerId。ゲストの guest_id は認証 Cookie の
 * 秘密だが、in-game playerId は Join/イベントで参加者に配布され公開される。両者を
 * 同一にすると参加者が guest_id を学習して Cookie に詐称し、発言・ミュート・BAN の
 * identity をなりすませてしまう。よってゲストは guest_id の非可逆な派生値を使い、
 * guest_id 自体は一切ゲームに出さない。OAuth の userId は公開情報かつ認証は
 * セッションで守られるためそのまま使う。
 *
 * 派生は決定的なので同一 guest_id（同一端末）は常に同一 playerId になり、ゲーム上も
 * 同一プレイヤーとして扱われる。playId を混ぜないため部屋をまたぐと相関しうるが、
 * guest_id そのものではないので詐称は防げる（in-game id ＝ guest_id だった従来より安全）。
 */
const KEY_LENGTH = 16;

function getSecret() {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AUTH_SECRET is required.");
    }
    return secret;
}

export function gamePlayerId(user: Pick<User, "authType" | "id">): string {
    if (user.authType === "oauth") {
        return user.id;
    }
    // next-auth の JWT や他の Cookie と鍵素材を共有しないようラベルで分離する
    return createHmac("sha256", `game-player:${getSecret()}`)
        .update(user.id)
        .digest("base64url")
        .slice(0, KEY_LENGTH);
}

/**
 * ゲームから渡された in-game playerId を、この部屋の視聴者へ戻す。
 *
 * WHY: 派生は非可逆なので逆算できない。この部屋の在籍者の側から派生値を組んで
 * 突き合わせる。候補をこの部屋の PlaySession に限るのが要点で、発行者の BAN 一覧
 * まで広げると、この部屋に来たことのない相手（他の部屋で BAN した相手）まで
 * 解決でき、コンテンツが無関係な相手を BAN できてしまう。
 */
export async function resolveGamePlayer(
    playerId: string,
    playId: number,
): Promise<Pick<User, "authType" | "id"> | null> {
    const sessions = await prisma.playSession.findMany({
        where: { playId },
        select: { viewerId: true },
    });
    for (const session of sessions) {
        const viewer = parseSessionViewerId(session.viewerId);
        if (viewer && gamePlayerId(viewer) === playerId) {
            return viewer;
        }
    }
    return null;
}
