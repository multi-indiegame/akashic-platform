import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
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
        },
    });
    if (!user || !user.name) {
        return NextResponse.json({
            ok: false,
            reason: "NotFound",
        });
    }
    let provider: string | undefined;
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
    }
    return NextResponse.json({
        ok: true,
        data: {
            id: user.id,
            name: user.name,
            handle: user.handle ?? undefined,
            image: user.image ?? undefined,
            provider,
        },
    });
}
