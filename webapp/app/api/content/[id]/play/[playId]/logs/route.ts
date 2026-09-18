import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@multi-indiegame/persist-schema";
import { ContentLogEntry, ContentLogResponse } from "@/lib/types";
import { getAuth } from "@/lib/server/auth";
import {
    getBucket,
    getS3Client,
    s3KeyPrefix,
} from "@/lib/server/content-utils";

export async function GET(
    _req: NextRequest,
    ctx: RouteContext<"/api/content/[id]/play/[playId]/logs">,
): Promise<NextResponse<ContentLogResponse>> {
    const { id, playId } = await ctx.params;
    if (id == null || playId == null) {
        return NextResponse.json(
            { ok: false, reason: "InvalidParams" },
            { status: 400 },
        );
    }

    const content = await prisma.content.findUnique({
        where: { id: parseInt(id) },
        select: { game: { select: { publisherId: true } } },
    });
    if (!content) {
        return NextResponse.json(
            { ok: false, reason: "NotFound" },
            { status: 404 },
        );
    }

    const user = await getAuth();
    if (content.game.publisherId !== user?.id) {
        return NextResponse.json(
            { ok: false, reason: "Forbidden" },
            { status: 403 },
        );
    }

    const play = await prisma.play.findUnique({
        where: {
            id: parseInt(playId),
        },
        select: {
            logDeletedAt: true,
        },
    });
    if (play?.logDeletedAt != null) {
        return NextResponse.json(
            { ok: false, reason: "Deleted" },
            { status: 410 },
        );
    }

    const filter = _req.nextUrl.searchParams.get("filter");
    const format = _req.nextUrl.searchParams.get("format") ?? "plain";

    try {
        const result = await getS3Client().send(
            new GetObjectCommand({
                Bucket: getBucket(),
                Key: `${s3KeyPrefix}content-logs/${id}/${playId}.jsonl`,
            }),
        );
        const body = await result.Body?.transformToString("utf-8");
        if (body == null) {
            return NextResponse.json(
                { ok: false, reason: "NotFound" },
                { status: 404 },
            );
        }
        const logEntries = body
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => JSON.parse(line) as ContentLogEntry)
            .filter((entry) => {
                if (filter === "error") {
                    return entry.level === "error";
                }
                return true;
            });
        const responseBody =
            format === "plain"
                ? logEntries.map((entry) => entry.message).join("\n")
                : logEntries.map((entry) => JSON.stringify(entry)).join("\n");
        return new NextResponse(responseBody, {
            status: 200,
            headers: {
                "Content-Type": `${format === "plain" ? "text/plain" : "application/x-ndjson"}; charset=utf-8`,
            },
        });
    } catch (err) {
        const code = (err as { Code?: string }).Code;
        if (code === "NoSuchKey") {
            return NextResponse.json(
                { ok: false, reason: "NotFound" },
                { status: 404 },
            );
        }
        console.warn(
            `failed to fetch content log (id = ${id}, playId = ${playId})`,
            err,
        );
        return NextResponse.json(
            { ok: false, reason: "InternalError" },
            { status: 500 },
        );
    }
}
