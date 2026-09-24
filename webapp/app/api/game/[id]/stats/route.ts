import { NextRequest, NextResponse } from "next/server";
import { GameStatsResponse, StatsPeriod } from "@/lib/types";
import { fetchGameStats } from "@/lib/server/scoreboard-stats";
import { isValidMonth } from "@/lib/server/scoreboard-archive";
import { logSafe } from "@/lib/server/log-safe";

export async function GET(
    req: NextRequest,
    ctx: RouteContext<"/api/game/[id]/stats">,
): Promise<NextResponse<GameStatsResponse>> {
    const { id } = await ctx.params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId < 0) {
        return NextResponse.json({ ok: false, reason: "InvalidParams" });
    }
    const requested = req.nextUrl.searchParams.get("period");
    const period: StatsPeriod =
        requested === "recent" || requested === "month" ? requested : "all";
    const month = req.nextUrl.searchParams.get("month") ?? undefined;
    if (period === "month" && (!month || !isValidMonth(month))) {
        return NextResponse.json({ ok: false, reason: "InvalidParams" });
    }
    try {
        const res = NextResponse.json<GameStatsResponse>({
            ok: true,
            data: await fetchGameStats(gameId, period, month),
        });
        // 閲覧が集中しても DB にそのまま流さない。動きの速いデータではない
        res.headers.set("Cache-Control", "public, max-age=60");
        return res;
    } catch (err) {
        console.warn(
            "failed to fetch game stats (gameId = %s)",
            logSafe(gameId),
            err,
        );
        return NextResponse.json({ ok: false, reason: "InternalError" });
    }
}
