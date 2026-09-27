import { NextRequest, NextResponse } from "next/server";
import { verifyInternalRequest } from "@/lib/server/internal-signature";
import {
    ensureMonthlyArchive,
    isClosedMonth,
    isValidMonth,
} from "@/lib/server/scoreboard-archive";

function noStoreJson(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

/**
 * 閉じた月の集計を凍結する。manager-server が生レコードを消す前に呼ぶ
 */
export async function POST(req: NextRequest) {
    const verified = await verifyInternalRequest(req, "x-internal");
    if (!verified.ok) {
        return noStoreJson(
            {
                ok: false,
                reason: verified.reason,
            },
            verified.status,
        );
    }

    let body: { gameId?: unknown; month?: unknown };
    try {
        body = JSON.parse(verified.rawBody) as {
            gameId?: unknown;
            month?: unknown;
        };
    } catch {
        return noStoreJson(
            {
                ok: false,
                reason: "InvalidBody",
            },
            400,
        );
    }
    const { gameId, month } = body;
    if (
        typeof gameId !== "number" ||
        !Number.isInteger(gameId) ||
        typeof month !== "string" ||
        !isValidMonth(month) ||
        !isClosedMonth(month)
    ) {
        return noStoreJson(
            {
                ok: false,
                reason: "InvalidBody",
            },
            400,
        );
    }

    return noStoreJson({
        ok: true,
        result: await ensureMonthlyArchive(gameId, month),
    });
}
