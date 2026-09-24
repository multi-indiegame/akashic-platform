import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import { fetchTitles } from "@/lib/server/scoreboard-title";
import { UserProfileResponse } from "@/lib/types";
import { auth } from "@/lib/server/auth-next";

export async function GET(
    _req: NextRequest,
    ctx: RouteContext<"/api/user/[id]">,
): Promise<NextResponse<UserProfileResponse>> {
    const { id } = await ctx.params;
    if (id == null) {
        return NextResponse.json({
            ok: false,
            reason: "InvalidParams",
        });
    }
    const user = await prisma.user.findUnique({
        where: {
            id,
        },
        select: {
            id: true,
            name: true,
            handle: true,
            image: true,
            scoreboardPublic: true,
            scoreboardOptOut: true,
        },
    });
    if (!user || !user.name) {
        return NextResponse.json({
            ok: false,
            reason: "NotFound",
        });
    }
    let provider: string | undefined;
    // WHY: 公開設定と掲載の可否は本人だけが知ればよい。他人には返さない
    let scoreboardPublic: boolean | undefined;
    let scoreboardOptOut: boolean | undefined;
    const session = await auth();
    if (session?.user?.id === id) {
        provider = (
            await prisma.account.findFirst({
                where: {
                    userId: session.user.id,
                },
                select: {
                    provider: true,
                },
            })
        )?.provider;
        scoreboardPublic = user.scoreboardPublic;
        scoreboardOptOut = user.scoreboardOptOut;
    }
    // WHY: 称号はチャットなどでも出している公開情報。プロフィールでも見せる
    const titles = await fetchTitles(user.id, { limit: 3 });
    return NextResponse.json({
        ok: true,
        data: {
            id: user.id,
            titles,
            name: user.name,
            handle: user.handle ?? undefined,
            image: user.image ?? undefined,
            provider,
            scoreboardPublic,
            scoreboardOptOut,
        },
    });
}
