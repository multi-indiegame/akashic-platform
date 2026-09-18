import { NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import { BoardMessageInfo, BoardMessagesGetResponse, User } from "@/lib/types";
import { boardMessageCutoff } from "@/lib/server/board-message";
import { getAuth } from "@/lib/server/auth";
import { anonKey } from "@/lib/server/anon-key";
import { getMuteSet, isMuted, MuteSet } from "@/lib/server/mute";
import { isSameViewer } from "@/lib/server/viewer-identity";

type BoardMessageRecord = {
    id: number;
    authorName: string;
    guestId: string | null;
    body: string;
    createdAt: Date;
    author: { id: string; name: string | null; image: string | null } | null;
};

function toInfo(
    message: BoardMessageRecord,
    viewer: User | null,
    muteSet: MuteSet,
): BoardMessageInfo {
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
            anonKey: viewer ? anonKey(subject, viewer.id) : undefined,
            isSelf: isSameViewer(subject, viewer),
        },
        body: message.body,
        createdAt: message.createdAt,
        muted: isMuted(muteSet, subject) || undefined,
    };
}

export async function GET(): Promise<NextResponse<BoardMessagesGetResponse>> {
    try {
        // guest_id は proxy が発行済みのため anonKey は常に載る
        const user = await getAuth();
        const muteSet = await getMuteSet(user);
        const messages = await prisma.boardMessage.findMany({
            where: {
                createdAt: { gte: boardMessageCutoff() },
            },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                authorName: true,
                guestId: true,
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
        });
        return NextResponse.json({
            ok: true,
            data: messages.map((message) => toInfo(message, user, muteSet)),
        });
    } catch (err) {
        console.warn("failed to fetch board messages", err);
        return NextResponse.json({
            ok: false,
            reason: "InternalError",
        });
    }
}
