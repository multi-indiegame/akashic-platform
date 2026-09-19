import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import { GUEST_NAME, LiveResponse } from "@/lib/types";
import { getAuth } from "@/lib/server/auth";
import { publicContentBaseUrl } from "@/lib/server/akashic";
import { fetchLicense } from "@/lib/server/game-info";
import { getContentExternal } from "@/lib/server/content-get-external";
import {
    checkLimitedPlayAccess,
    fetchGameJson,
    fetchPlayRemaining,
    fetchPlayToken,
    getContentViewSize,
} from "@/lib/server/play-utils";
import { isFavorited } from "@/lib/server/favorite";
import { gamePlayerId } from "@/lib/server/game-player-id";
import { setPlayAccessCookie } from "@/lib/server/play-access-token";
import { isBannedFromPlay } from "@/lib/server/ban";
import {
    findPlaySessionToken,
    recordPlaySession,
} from "@/lib/server/play-session";
import { kickViewerFromPlays } from "@/lib/server/play-kick";
import { sessionViewerId, verifyRoomOwner } from "@/lib/server/viewer-identity";
import { logSafe } from "@/lib/server/log-safe";

export async function GET(
    req: NextRequest,
    ctx: RouteContext<"/api/live/[handle]">,
): Promise<NextResponse<LiveResponse>> {
    const { handle } = await ctx.params;
    const joinWord = req.nextUrl.searchParams.get("joinWord") ?? undefined;
    if (!handle) {
        return NextResponse.json({
            ok: false,
            reason: "NotFound",
        });
    }
    try {
        const gmUser = await prisma.user.findUnique({
            where: { handle },
            select: {
                id: true,
                name: true,
                handle: true,
                image: true,
            },
        });
        if (!gmUser) {
            return NextResponse.json({
                ok: false,
                reason: "NotFound",
            });
        }
        const play = await prisma.play.findFirst({
            where: {
                gmUserId: gmUser.id,
                isActive: true,
            },
            orderBy: {
                createdAt: "desc",
            },
            select: {
                id: true,
                contentId: true,
                gameMasterId: true,
                name: true,
                isLimited: true,
                requireSignIn: true,
                chatEnabled: true,
                joinWord: true,
                inviteHash: true,
                createdAt: true,
                content: {
                    select: {
                        icon: true,
                        game: {
                            select: {
                                id: true,
                                title: true,
                                description: true,
                                credit: true,
                                streaming: true,
                                playCount: true,
                                publisher: {
                                    select: {
                                        id: true,
                                        name: true,
                                        image: true,
                                    },
                                },
                                createdAt: true,
                                updatedAt: true,
                            },
                        },
                    },
                },
            },
        });
        const owner = {
            userId: gmUser.id,
            name: gmUser.name ?? GUEST_NAME,
            iconURL: gmUser.image ?? undefined,
        };
        if (!play) {
            return NextResponse.json({
                ok: true,
                data: {
                    owner,
                    requiresJoinWord: false,
                },
            });
        }
        // guest_id は proxy が発行済みで通常 null にならないが、万一
        // 身元が取れないなら追跡不能な playToken を発行しないよう入室を止める
        const user = await getAuth();
        if (!user) {
            return NextResponse.json({ ok: false, reason: "InternalError" });
        }
        // live の部屋主は必ずサインイン利用者。OAuth はセッションで判定できるので
        // owner Cookie は不要（verifyRoomOwner が oauth 分岐で確定する）
        const isOwner = verifyRoomOwner(
            {
                id: play.id,
                gameMasterId: play.gameMasterId,
                gmUserId: gmUser.id,
            },
            user,
            undefined,
        );
        const denied = await checkLimitedPlayAccess(
            play,
            user,
            { joinWord },
            isOwner,
        );
        if (denied) {
            return NextResponse.json({
                ok: true,
                data: {
                    owner,
                    requiresJoinWord: true,
                    reason: denied.reason,
                },
            });
        }
        if (
            await isBannedFromPlay(user, { id: play.id, gmUserId: gmUser.id })
        ) {
            return NextResponse.json({
                ok: true,
                data: {
                    owner,
                    requiresJoinWord: true,
                    reason: "Banned",
                },
            });
        }
        const remaining = await fetchPlayRemaining(play.id);
        if (!remaining) {
            // play 終了直後はまだ active だが、セッションは既に破棄済み。終了扱い
            return NextResponse.json({
                ok: true,
                data: {
                    owner,
                    requiresJoinWord: false,
                },
            });
        }
        const { remainingMs, expiresAt } = remaining;
        const gameJson = await fetchGameJson(play.contentId);
        // revalidation で毎回発行すると使われない token が累積するため、この視聴者に
        // 既発行の token があれば再利用する（新規時のみ発行・記録）
        const viewerId = sessionViewerId(user);
        const existingToken = await findPlaySessionToken(play.id, viewerId);
        const playToken =
            existingToken ?? (await fetchPlayToken(play.id, play.contentId));
        const res = NextResponse.json<LiveResponse>({
            ok: true,
            data: {
                owner,
                requiresJoinWord: false,
                info: {
                    id: play.id,
                    playToken,
                    playerId: gamePlayerId(user),
                    playName: play.name,
                    isLimited: play.isLimited,
                    requireSignIn: play.requireSignIn,
                    chatEnabled: play.chatEnabled,
                    joinWord: play.joinWord ?? undefined,
                    inviteHash: play.inviteHash ?? undefined,
                    isGameMaster: isOwner,
                    gameMaster: {
                        userId: gmUser.id,
                        name: gmUser.name ?? GUEST_NAME,
                        iconURL: gmUser.image ?? undefined,
                        handle: gmUser.handle ?? undefined,
                    },
                    game: {
                        id: play.content.game.id,
                        title: play.content.game.title,
                        iconURL: `${publicContentBaseUrl}/${play.contentId}/${play.content.icon}`,
                        description: play.content.game.description,
                        credit: play.content.game.credit,
                        streaming: play.content.game.streaming,
                        playCount: play.content.game.playCount,
                        license: await fetchLicense(play.contentId),
                        publisher: {
                            id: play.content.game.publisher.id,
                            name: play.content.game.publisher.name!,
                            image:
                                play.content.game.publisher.image ?? undefined,
                        },
                        contentId: play.contentId,
                        isFavorited: await isFavorited(
                            user,
                            play.content.game.id,
                        ),
                        createdAt: play.content.game.createdAt,
                        updatedAt: play.content.game.updatedAt,
                    },
                    createdAt: play.createdAt,
                    expiresAt,
                    remainingMs,
                    external: await getContentExternal(gameJson),
                    ...(await getContentViewSize(gameJson)),
                },
            },
        });
        if (user) {
            // 新規発行時のみ記録する。再利用時は既に記録済み
            if (!existingToken) {
                await recordPlaySession(play.id, viewerId, playToken);
            }
            // 記録の後にもう一度 BAN 判定し、入室と BAN 発行の競合を潰す
            if (
                await isBannedFromPlay(user, {
                    id: play.id,
                    gmUserId: gmUser.id,
                })
            ) {
                await kickViewerFromPlays([play.id], viewerId);
                return NextResponse.json({
                    ok: true,
                    data: { owner, requiresJoinWord: true, reason: "Banned" },
                });
            }
            setPlayAccessCookie(
                res,
                play.id,
                sessionViewerId(user),
                req.cookies.getAll(),
            );
        }
        return res;
    } catch (err) {
        console.warn(
            `failed to get live play (handle = "${logSafe(handle)}")`,
            err,
        );
        return NextResponse.json({ ok: false, reason: "InternalError" });
    }
}
