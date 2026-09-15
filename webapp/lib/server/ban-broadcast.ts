import type { Event } from "@akashic/playlog";
import { prisma } from "@yasshi2525/persist-schema";
import {
    type PlayerBanAction,
    buildBanNotificationEvent,
} from "@multi-indiegame/akashic-player-ban-plugin";
import { User } from "../types";
import { akashicServerUrl, withAkashicServerAuth } from "./akashic";
import { BanScope } from "./ban";
import { gamePlayerId } from "./game-player-id";
import { kickViewerFromPlays } from "./play-kick";
import { sessionViewerId } from "./viewer-identity";

/**
 * 通知の注入を待つ上限。
 *
 * WHY: 通知は best-effort だが kick は BAN の実効化そのもので、遅らせてよい
 * ものではない。上限を設けないと、通知先 1 部屋の応答が返らないだけで全部屋の
 * 切断が止まり、BAN 済みの相手が接続したまま残る。
 */
const SEND_EVENT_TIMEOUT_MS = parseInt(
    process.env.BAN_SEND_EVENT_TIMEOUT_MS ?? "3000",
);

/**
 * 拡張向けの通知イベントを 1 部屋へ注入する。best-effort とし、失敗しても
 * BAN 自体は入室ガードで担保される（kick と同じ方針）。
 */
async function sendPlayEvent(playId: number, event: Event) {
    try {
        const res = await fetch(
            `${akashicServerUrl}/send-event?playId=${playId}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...withAkashicServerAuth(),
                },
                body: JSON.stringify({ event }),
                signal: AbortSignal.timeout(SEND_EVENT_TIMEOUT_MS),
            },
        );
        if (!res.ok) {
            console.warn(
                `send-event request failed (playId = "${playId}", status = ${res.status})`,
            );
        }
    } catch (err) {
        console.warn(`send-event request error (playId = "${playId}")`, err);
    }
}

/**
 * BAN / 解除の確定を、その部屋主の全 active 部屋へ反映する。
 * ゲーム内・チャット・設定画面など、確定するあらゆる経路がここを通る。
 *
 * サインイン部屋主の BAN は全部屋に効くのだから、通知も全部屋に届かないと
 * コンテンツの表示と実態がずれる。
 */
export async function applyBanChange(param: {
    scope: BanScope;
    target: Pick<User, "authType" | "id">;
    action: PlayerBanAction;
}) {
    const playIds =
        "gmUserId" in param.scope
            ? (
                  await prisma.play.findMany({
                      where: { gmUserId: param.scope.gmUserId, isActive: true },
                      select: { id: true },
                  })
              ).map((p) => p.id)
            : [param.scope.playId];
    if (playIds.length === 0) {
        return;
    }
    // 注入を kick より先に行う。逆順だと、切断される本人の画面に退場が反映され
    // ないまま接続が切れる可能性が上がるため。待つのは SEND_EVENT_TIMEOUT_MS まで
    // で、通知が滞っても kick は必ず実行する。
    //
    // ただし順序は保証できない。/send-event は storage が Valkey へ publish した
    // 時点で 200 を返し、active インスタンスがそれを tick に載せて配るのは非同期
    // なので、本人が tick を受け取る前に kick が届くことはありうる。保証するには
    // tick へ載ったことの ack が要るが、AMFlow にその口が無い。
    // 本人以外は切断されないので、進行から外す側の決定性には影響しない。
    const event = buildBanNotificationEvent(
        param.action,
        gamePlayerId(param.target),
    );
    await Promise.all(playIds.map((playId) => sendPlayEvent(playId, event)));
    if (param.action === "banned") {
        await kickViewerFromPlays(playIds, sessionViewerId(param.target));
    }
}
