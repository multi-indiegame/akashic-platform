import { prisma } from "@multi-indiegame/persist-schema";
import { akashicServerUrl, withAkashicServerAuth } from "./akashic";

/**
 * 対象視聴者を指定した部屋群から即時切断する。記録済みの playToken ごとに
 * akashic-server の /kick を叩いて失効させ、失効に成功した行だけ削除する（失敗
 * した行は残す。控えを消すと再 BAN で対象を見つけられず、未失効 token でソケットが
 * 生き続けるため）。best-effort とし、切断に失敗しても BAN は再入室拒否側で担保。
 */
export async function kickViewerFromPlays(playIds: number[], viewerId: string) {
    if (playIds.length === 0) {
        return;
    }
    const sessions = await prisma.playSession.findMany({
        where: { playId: { in: playIds }, viewerId },
        select: { id: true, playId: true, playToken: true },
    });
    const revokedIds = await Promise.all(
        sessions.map(async (s) => {
            try {
                const res = await fetch(
                    `${akashicServerUrl}/kick?playId=${s.playId}&playToken=${encodeURIComponent(
                        s.playToken,
                    )}`,
                    { headers: withAkashicServerAuth() },
                );
                if (!res.ok) {
                    console.warn(
                        `kick request failed (playId = "${s.playId}", status = ${res.status})`,
                    );
                    return null;
                }
                return s.id;
            } catch (err) {
                console.warn(
                    `kick request error (playId = "${s.playId}")`,
                    err,
                );
                return null;
            }
        }),
    );
    const succeeded = revokedIds.filter((id): id is number => id !== null);
    if (succeeded.length > 0) {
        await prisma.playSession.deleteMany({
            where: { id: { in: succeeded } },
        });
    }
}
