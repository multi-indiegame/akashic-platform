import { prisma } from "@multi-indiegame/persist-schema";
import { User } from "../types";
import { gamePlayerId } from "./game-player-id";
import { sessionViewerId } from "./viewer-identity";
import { logSafe } from "./log-safe";

/**
 * 入室した視聴者を、ゲームへ申告した in-game playerId と対応づけて控える。
 *
 * WHY: 実行基盤が集める記録は playerId しか持たない。それが誰かを知っているのは
 * webapp だけなので、突き合わせの材料をここで作っておく。入室 GET は revalidation
 * でも呼ばれるため upsert で冪等にし、既に同意まで済んでいる行を作り直さない。
 *
 * 記録できなくても入室は妨げない。統計へ載らないだけで、遊ぶことには影響しない。
 */
export async function recordPlayParticipant(
    playId: number,
    user: Pick<User, "authType" | "id">,
    isGameMaster: boolean,
) {
    const playerId = gamePlayerId(user);
    const viewerId = sessionViewerId(user);
    const userId = user.authType === "oauth" ? user.id : null;
    try {
        await prisma.playParticipant.upsert({
            where: { playId_playerId: { playId, playerId } },
            create: { playId, playerId, viewerId, userId, isGameMaster },
            update: { viewerId, userId, isGameMaster },
        });
    } catch (err) {
        console.warn(
            "failed to record play participant (playId = %s, playerId = %s)",
            logSafe(playId),
            logSafe(playerId),
            err,
        );
    }
}
