import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import {
    PlayChatGetResponse,
    PlayChatMessageInfo,
    TitleBadge,
    User,
} from "@/lib/types";
import {
    authorizePlayChat,
    PLAY_CHAT_FETCH_LIMIT,
} from "@/lib/server/play-chat";
import { setPlayAccessCookie } from "@/lib/server/play-access-token";
import {
    playOwnerCookieName,
    refreshPlayOwnerCookie,
} from "@/lib/server/play-owner-token";
import { anonKey } from "@/lib/server/anon-key";
import { getMuteSet, isMuted, MuteSet } from "@/lib/server/mute";
import {
    isSameViewer,
    sessionViewerId,
    verifyRoomOwner,
} from "@/lib/server/viewer-identity";
import { fetchTitlesForUsers } from "@/lib/server/scoreboard-title";

type PlayChatRecord = {
    id: number;
    authorName: string;
    guestId: string | null;
    body: string;
    createdAt: Date;
    author: { id: string; image: string | null } | null;
};

function toInfo(
    message: PlayChatRecord,
    viewer: User,
    muteSet: MuteSet,
    titles: Map<string, TitleBadge[]>,
): PlayChatMessageInfo {
    const subject = {
        authorId: message.author?.id,
        guestId: message.guestId,
    };
    return {
        id: message.id,
        author: {
            id: message.author?.id ?? undefined,
            name: message.authorName,
            iconURL: message.author?.image ?? undefined,
            anonKey: anonKey(subject, viewer.id),
            isSelf: isSameViewer(subject, viewer),
        },
        titles: message.author?.id ? titles.get(message.author.id) : undefined,
        body: message.body,
        createdAt: message.createdAt,
        muted: isMuted(muteSet, subject) || undefined,
    };
}

export async function GET(
    req: NextRequest,
    ctx: RouteContext<"/api/play/[id]/chat">,
): Promise<NextResponse<PlayChatGetResponse>> {
    const { id } = await ctx.params;
    const playId = parseInt(id);
    if (!Number.isSafeInteger(playId)) {
        return NextResponse.json({ ok: false, reason: "InvalidParams" });
    }
    const afterParam = req.nextUrl.searchParams.get("after");
    const after = afterParam == null ? undefined : parseInt(afterParam);
    if (after != null && !Number.isSafeInteger(after)) {
        return NextResponse.json({ ok: false, reason: "InvalidParams" });
    }
    try {
        const auth = await authorizePlayChat(playId);
        if (!auth.ok) {
            return NextResponse.json({ ok: false, reason: auth.reason });
        }
        const muteSet = await getMuteSet(auth.user);
        const messages = await prisma.playChatMessage.findMany({
            where: {
                playId,
                ...(after != null ? { id: { gt: after } } : {}),
            },
            orderBy: { id: "desc" },
            take: PLAY_CHAT_FETCH_LIMIT,
            select: {
                id: true,
                authorName: true,
                guestId: true,
                body: true,
                createdAt: true,
                author: {
                    select: {
                        id: true,
                        image: true,
                    },
                },
            },
        });
        // WHY: 表示中のメッセージの投稿者分をまとめて 1 回で引く。
        // メッセージごとに引くとポーリングのたびに件数分の問い合わせになる
        const titles = await fetchTitlesForUsers(
            messages
                .map((message) => message.author?.id)
                .filter((id): id is string => !!id),
            auth.gameId,
        );
        const res = NextResponse.json<PlayChatGetResponse>({
            ok: true,
            data: messages
                .reverse()
                .map((message) => toInfo(message, auth.user, muteSet, titles)),
        });
        if (auth.needsRenew) {
            setPlayAccessCookie(
                res,
                playId,
                sessionViewerId(auth.user),
                req.cookies.getAll(),
            );
        }
        // ゲスト部屋主が在室し続ける限り owner 資格の期限を延長する。チャット
        // ポーリングは部屋が生きている間ずっと走るので、入室 GET だけの延長では
        // 12h を超える長時間部屋で失効してしまう問題をここで埋める
        if (
            !auth.gmUserId &&
            verifyRoomOwner(
                {
                    id: playId,
                    gameMasterId: auth.gameMasterId,
                    gmUserId: auth.gmUserId,
                },
                auth.user,
                req.cookies.get(playOwnerCookieName(playId))?.value,
            )
        ) {
            refreshPlayOwnerCookie(res, playId, auth.gameMasterId);
        }
        return res;
    } catch (err) {
        console.warn(`failed to fetch play chat (playId = "${playId}")`, err);
        return NextResponse.json({ ok: false, reason: "InternalError" });
    }
}
