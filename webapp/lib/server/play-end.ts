import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";
import { akashicServerUrl, withAkashicServerAuth } from "./akashic";

// 認可を行わず任意の部屋を任意の理由で終了できるため Server Action ("use server") に
// してはならない。クライアントからは play-end-action.ts の endPlayAction を使う
export async function endPlay({
    playId,
    reason,
}: {
    playId: string;
    reason: PlayEndReason;
}): Promise<boolean> {
    const query = new URLSearchParams({ playId, reason });
    const res = await fetch(`${akashicServerUrl}/end?${query}`, {
        headers: withAkashicServerAuth(),
    });
    if (res.status !== 200) {
        console.warn(
            `failed to end. (playId = "${playId}", cause = "${await res.text()}")`,
        );
        return false;
    }
    return true;
}
