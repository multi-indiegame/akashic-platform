"use server";

import { randomBytes } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@multi-indiegame/persist-schema";
import { publicContentBaseUrl } from "./akashic";
import { getBucket, getS3Client, s3KeyPrefix } from "./content-utils";

const SHARE_PREFIX = "play-share";

const joinUrl = (baseUrl: string, path: string) =>
    `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

export type PlayShareErrorType = "InvalidParams" | "NotFound" | "InternalError";

export type PlayShareResponse =
    | { ok: true; shareId: string; imageUrl: string }
    | { ok: false; reason: PlayShareErrorType };

export async function getShareImagePath(playId: number, shareId: string) {
    return `${SHARE_PREFIX}/${playId}/${shareId}.png`;
}

export async function getShareImageUrl(playId: number, shareId: string) {
    return joinUrl(
        publicContentBaseUrl,
        await getShareImagePath(playId, shareId),
    );
}

export async function uploadPlayShareScreenshot(
    formData: FormData,
): Promise<PlayShareResponse> {
    const playIdRaw = formData.get("playId");
    const file = formData.get("image");
    if (
        playIdRaw == null ||
        typeof playIdRaw !== "string" ||
        !(file instanceof File)
    ) {
        return { ok: false, reason: "InvalidParams" };
    }
    try {
        const playId = Number.parseInt(playIdRaw);
        const play = await prisma.play.findUnique({
            where: { id: playId },
            select: { id: true },
        });
        if (!play) {
            return { ok: false, reason: "NotFound" };
        }
        const shareId = randomBytes(3).toString("hex");
        const key = await getShareImagePath(playId, shareId);
        const body = Buffer.from(await file.arrayBuffer());
        await getS3Client().send(
            new PutObjectCommand({
                Bucket: getBucket(),
                Key: `${s3KeyPrefix}${key}`,
                Body: body,
                ContentType: file.type || "image/png",
            }),
        );
        return {
            ok: true,
            shareId,
            imageUrl: await getShareImageUrl(playId, shareId),
        };
    } catch (err) {
        console.warn(
            `failed to upload play share screenshot (playId = "${playIdRaw}")`,
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}
