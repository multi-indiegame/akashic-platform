import { NextRequest, NextResponse } from "next/server";
import { getDrainState, setDrainState } from "@/lib/server/drain-state";
import { verifyInternalRequest } from "@/lib/server/internal-signature";

function noStoreJson(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

export async function GET() {
    return noStoreJson({
        ok: true,
        ...getDrainState(),
    });
}

export async function POST(req: NextRequest) {
    const verified = await verifyInternalRequest(req, "x-drain");
    if (!verified.ok) {
        return noStoreJson(
            {
                ok: false,
                reason: verified.reason,
            },
            verified.status,
        );
    }

    let body: { enabled?: boolean; reason?: string };
    try {
        body = JSON.parse(verified.rawBody) as {
            enabled?: boolean;
            reason?: string;
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
    if (typeof body.enabled !== "boolean") {
        return noStoreJson(
            {
                ok: false,
                reason: "InvalidBody",
            },
            400,
        );
    }

    setDrainState({
        enabled: body.enabled,
        reason: body.reason,
    });
    return noStoreJson({
        ok: true,
        ...getDrainState(),
    });
}
