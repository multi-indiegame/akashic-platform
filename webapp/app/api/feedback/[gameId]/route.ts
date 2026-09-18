import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import { FEEDBACK_LIMITS, FeedbackResponse, GUEST_NAME } from "@/lib/types";

export async function GET(
    req: NextRequest,
    ctx: RouteContext<"/api/feedback/[gameId]">,
): Promise<NextResponse<FeedbackResponse>> {
    const { gameId } = await ctx.params;
    if (gameId == null) {
        return NextResponse.json({
            ok: false,
            reason: "InvalidParams",
        });
    }
    const game = await prisma.game.findUnique({
        where: {
            id: parseInt(gameId),
        },
        select: {
            id: true,
        },
    });
    if (game == null) {
        return NextResponse.json({
            ok: false,
            reason: "NotFound",
        });
    }

    const limits = parseInt(
        req.nextUrl.searchParams.get("limits") ?? FEEDBACK_LIMITS.toString(),
    );
    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "0");

    const posts = await prisma.feedbackPost.findMany({
        take: limits,
        skip: page * limits,
        where: {
            gameId: parseInt(gameId),
        },
        orderBy: {
            id: "desc",
        },
        select: {
            id: true,
            authorName: true,
            body: true,
            createdAt: true,
            author: {
                select: {
                    id: true,
                    name: true,
                    image: true,
                },
            },
            reply: {
                select: {
                    id: true,
                    body: true,
                    createdAt: true,
                    author: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                        },
                    },
                },
            },
        },
    });

    return NextResponse.json({
        ok: true,
        data: posts.map((post) => ({
            id: post.id,
            author: {
                id: post.author?.id ?? undefined,
                name: post.authorName,
                iconURL: post.author?.image ?? undefined,
            },
            body: post.body,
            createdAt: post.createdAt,
            reply: post.reply
                ? {
                      id: post.reply.id,
                      author: {
                          id: post.reply.author.id,
                          name: post.reply.author.name ?? GUEST_NAME,
                          iconURL: post.reply.author.image ?? undefined,
                      },
                      body: post.reply.body,
                      createdAt: post.reply.createdAt,
                  }
                : undefined,
        })),
    });
}
