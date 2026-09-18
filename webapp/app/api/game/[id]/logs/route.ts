import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import {
    GUEST_NAME,
    CONTENT_LOGLIST_LIMITS,
    ContentLogListResponse,
} from "@/lib/types";
import { getAuth } from "@/lib/server/auth";

export async function GET(
    req: NextRequest,
    ctx: RouteContext<"/api/game/[id]/logs">,
): Promise<NextResponse<ContentLogListResponse>> {
    const { id } = await ctx.params;
    if (id == null) {
        return NextResponse.json({
            ok: false,
            reason: "InvalidParams",
        });
    }

    const game = await prisma.game.findUnique({
        where: {
            id: parseInt(id),
        },
        select: {
            id: true,
            publisherId: true,
        },
    });
    if (!game) {
        return NextResponse.json({
            ok: false,
            reason: "NotFound",
        });
    }
    const user = await getAuth();
    if (game.publisherId !== user?.id) {
        return NextResponse.json({
            ok: false,
            reason: "Forbidden",
        });
    }

    const limits = parseInt(
        req.nextUrl.searchParams.get("limits") ??
            CONTENT_LOGLIST_LIMITS.toString(),
    );
    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "0");

    const plays = await prisma.play.findMany({
        take: limits,
        skip: page * limits,
        where: {
            isActive: false,
            content: {
                gameId: game.id,
            },
        },
        orderBy: {
            id: "desc",
        },
        select: {
            id: true,
            contentId: true,
            name: true,
            gmUser: {
                select: {
                    id: true,
                    name: true,
                    image: true,
                },
            },
            createdAt: true,
            endedAt: true,
            logUploadedAt: true,
            logDeletedAt: true,
            crashed: true,
            errorLogged: true,
        },
    });

    const clientLogGroups = await prisma.clientLogRecord.groupBy({
        by: ["playId", "clientId"],
        where: {
            playId: {
                in: plays.map((p) => p.id),
            },
        },
    });
    const clientLogCountMap = new Map<number, number>();
    for (const { playId } of clientLogGroups) {
        clientLogCountMap.set(playId, (clientLogCountMap.get(playId) ?? 0) + 1);
    }

    return NextResponse.json({
        ok: true,
        data: plays.map((play) => ({
            playId: play.id,
            contentId: play.contentId,
            name: play.name,
            gameMaster: {
                userId: play.gmUser?.id ?? undefined,
                name: play.gmUser?.name ?? GUEST_NAME,
                iconURL: play.gmUser?.image ?? undefined,
            },
            createdAt: play.createdAt,
            endedAt: play.endedAt,
            logUploadedAt: play.logUploadedAt,
            logDeletedAt: play.logDeletedAt,
            crashed: play.crashed,
            errorLogged: play.errorLogged,
            clientLogCount: clientLogCountMap.get(play.id) ?? 0,
        })),
    });
}
