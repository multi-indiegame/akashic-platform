import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { registerRequestId } from "./drain-state";

const MAX_SKEW_MS = 60 * 1000;
const REQUEST_ID_TTL_MS = 5 * 60 * 1000;

export type InternalRequestVerification =
    | { ok: true; rawBody: string }
    | { ok: false; status: number; reason: string };

function verifySignature({
    secret,
    timestamp,
    rawBody,
    signature,
}: {
    secret: string;
    timestamp: string;
    rawBody: string;
    signature: string;
}) {
    const expected = createHmac("sha256", secret)
        .update(`${timestamp}.${rawBody}`)
        .digest("hex");
    const actualBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (actualBuf.length !== expectedBuf.length) {
        return false;
    }
    return timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * manager-server から HMAC で署名して送られたリクエストを検証する。
 *
 * ヘッダーは `<headerPrefix>-timestamp`、`<headerPrefix>-id`、
 * `<headerPrefix>-signature` を読む。
 */
export async function verifyInternalRequest(
    req: NextRequest,
    headerPrefix: string,
): Promise<InternalRequestVerification> {
    const secret = process.env.HMAC_SECRET;
    if (!secret) {
        return { ok: false, status: 500, reason: "ServerMisconfigured" };
    }

    const timestamp = req.headers.get(`${headerPrefix}-timestamp`);
    const signature = req.headers.get(`${headerPrefix}-signature`);
    const requestId = req.headers.get(`${headerPrefix}-id`);
    if (!timestamp || !signature || !requestId) {
        return { ok: false, status: 401, reason: "MissingHeaders" };
    }

    const timestampMs = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(timestampMs)) {
        return { ok: false, status: 401, reason: "InvalidTimestamp" };
    }
    if (Math.abs(Date.now() - timestampMs) > MAX_SKEW_MS) {
        return { ok: false, status: 401, reason: "ExpiredTimestamp" };
    }
    const rawBody = await req.text();
    if (!verifySignature({ secret, timestamp, rawBody, signature })) {
        return { ok: false, status: 401, reason: "InvalidSignature" };
    }
    if (
        !registerRequestId({
            requestId,
            nowMs: Date.now(),
            ttlMs: REQUEST_ID_TTL_MS,
        })
    ) {
        return { ok: false, status: 401, reason: "ReplayDetected" };
    }
    return { ok: true, rawBody };
}
