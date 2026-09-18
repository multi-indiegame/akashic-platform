import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@multi-indiegame/persist-schema";
import { NOTIFICATION_LIMITS } from "@/lib/types";
import { getAuth } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
    const auth = await getAuth();
    if (!auth || auth.authType !== "oauth") {
        return NextResponse.json({
            ok: false,
            reason: "NotAuthorized",
        });
    }

    const limits = parseInt(
        req.nextUrl.searchParams.get("limits") ??
            NOTIFICATION_LIMITS.toString(),
    );
    const page = parseInt(req.nextUrl.searchParams.get("page") ?? "0");

    const notices = await prisma.notification.findMany({
        take: limits,
        skip: page * limits,
        where: {
            userId: auth.id,
        },
        orderBy: {
            createdAt: "desc",
        },
        select: {
            id: true,
            unread: true,
            type: true,
            iconURL: true,
            body: true,
            link: true,
            createdAt: true,
        },
    });

    return NextResponse.json({ ok: true, data: notices });
}
