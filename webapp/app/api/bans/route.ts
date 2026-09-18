import { NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import { BansGetResponse } from "@/lib/types";
import { getAuth } from "@/lib/server/auth";
import { BAN_LIMIT } from "@/lib/server/ban";

export async function GET(): Promise<NextResponse<BansGetResponse>> {
    try {
        const user = await getAuth();
        if (!user) {
            return NextResponse.json({ ok: false, reason: "Unauthorized" });
        }
        // ゲスト部屋主の guest_id は in-game で公開され偽造できるため、BAN 一覧は
        // サインイン部屋主に限定する（ゲスト BAN は管理 UI が無く部屋終了で失効）
        if (user.authType !== "oauth") {
            return NextResponse.json({ ok: true, data: [], limit: BAN_LIMIT });
        }
        // 自分が部屋主として発行した BAN のみ
        const bans = await prisma.ban.findMany({
            where: { gmUserId: user.id },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                labelSnapshot: true,
                playId: true,
                createdAt: true,
            },
        });
        return NextResponse.json({
            ok: true,
            data: bans.map((ban) => ({
                id: ban.id,
                label: ban.labelSnapshot,
                allRooms: ban.playId == null,
                createdAt: ban.createdAt,
            })),
            limit: BAN_LIMIT,
        });
    } catch (err) {
        console.warn("failed to fetch bans", err);
        return NextResponse.json({ ok: false, reason: "InternalError" });
    }
}
