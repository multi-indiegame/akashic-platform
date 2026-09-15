import { NextResponse } from "next/server";
import { prisma } from "@yasshi2525/persist-schema";
import { MutesGetResponse } from "@/lib/types";
import { getAuth } from "@/lib/server/auth";
import { MUTE_LIMIT } from "@/lib/server/mute";

export async function GET(): Promise<NextResponse<MutesGetResponse>> {
    try {
        const user = await getAuth();
        // 未サインイン利用者のミュートは端末内にあり、サーバーは関与しない
        if (user?.authType !== "oauth") {
            return NextResponse.json({ ok: false, reason: "Unauthorized" });
        }
        const mutes = await prisma.mute.findMany({
            where: { ownerId: user.id },
            orderBy: { createdAt: "desc" },
            select: { id: true, labelSnapshot: true, createdAt: true },
        });
        return NextResponse.json({
            ok: true,
            data: mutes.map((mute) => ({
                id: mute.id,
                label: mute.labelSnapshot,
                createdAt: mute.createdAt,
            })),
            limit: MUTE_LIMIT,
        });
    } catch (err) {
        console.warn("failed to fetch mutes", err);
        return NextResponse.json({ ok: false, reason: "InternalError" });
    }
}
