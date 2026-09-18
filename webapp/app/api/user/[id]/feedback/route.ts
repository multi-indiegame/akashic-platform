import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import { FEEDBACK_LIMITS, GUEST_NAME, UserFeedbackResponse } from "@/lib/types";
import { publicContentBaseUrl } from "@/lib/server/akashic";

export async function GET(
    req: NextRequest,
    ctx: RouteContext<"/api/user/[id]/feedback">,
): Promise<NextResponse<UserFeedbackResponse>> {
    const { id } = await ctx.params;
    if (id == null) {
        return NextResponse.json({
            ok: false,
            reason: "InvalidParams",
        });
    }
    const type = req.nextUrl.searchParams.get("type");
    if (type !== "received" && type !== "posted") {
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
        },
    });
    if (!user) {
        return NextResponse.json({
            ok: false,
            reason: "NotFound",
        });
    }
    const limits = parseInt(
        req.nextUrl.searchParams.get("limits") ?? FEEDBACK_LIMITS.toString(),
    );
    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "0");

    const select = {
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
        game: {
            select: {
                id: true,
                title: true,
                versions: {
                    take: 1,
                    select: {
                        id: true,
                        icon: true,
                    },
                    orderBy: {
                        id: "desc",
                    },
                },
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
    } as const;

    const posts =
        type === "received"
            ? await prisma.feedbackPost.findMany({
                  take: limits,
                  skip: page * limits,
                  where: {
                      game: {
                          publisherId: id,
                      },
                      reply: {
                          is: null,
                      },
                  },
                  orderBy: {
                      id: "desc",
                  },
                  select,
              })
            : await prisma.feedbackPost.findMany({
                  take: limits,
                  skip: page * limits,
                  where: {
                      authorId: id,
                  },
                  orderBy: {
                      id: "desc",
                  },
                  select,
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
            game: {
                id: post.game.id,
                title: post.game.title,
                iconURL: `${publicContentBaseUrl}/${post.game.versions[0].id}/${post.game.versions[0].icon}`,
            },
        })),
    });
}
