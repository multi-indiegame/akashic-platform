import * as path from "node:path";
import process from "node:process";
import { randomBytes } from "node:crypto";
import {
    DeleteObjectsCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import JSZip, { JSZipObject } from "jszip";
import type { GameConfiguration } from "@akashic/game-configuration";
import { prisma } from "@multi-indiegame/persist-schema";
import { ContentErrorResponse } from "../types";
import {
    checkGameJsonEnvironment,
    formatValue,
    getGameJsonEnvironment,
} from "../share/game-json";
import {
    exceedsContentExternalLimits,
    listContentExternals,
} from "../share/content-external";

export interface GameForm {
    title: string;
    gameFile: File;
    iconFile: File;
    description: string;
    credit: string;
    streaming: boolean;
    externalLaunch: boolean;
    /** 使用プラグインのうち、投稿者が必須と申告したもの */
    requiredExternals: string[];
}

let s3Client: S3Client | undefined;
export const s3KeyPrefix = process.env.S3_KEY_PREFIX ?? "";

const contentTypeByExt: Record<string, string> = {
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".txt": "text/plain",
    ".woff2": "font/woff2",
};

/**
 * ファイル名（拡張子）から配信用の Content-Type を導出する。
 * 別オリジンから no-cors で読み込まれる画像・音声が Firefox の
 * OpaqueResponseBlocking でブロックされるのを防ぐため、アップロード時に付与する。
 */
export function contentTypeFromName(name: string): string {
    return (
        contentTypeByExt[path.extname(name).toLowerCase()] ??
        "application/octet-stream"
    );
}

export function getS3Client() {
    if (!s3Client) {
        s3Client = new S3Client({
            region: process.env.S3_REGION ?? "us-east-1",
            endpoint: process.env.S3_ENDPOINT,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
            credentials:
                process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
                    ? {
                          accessKeyId: process.env.S3_ACCESS_KEY,
                          secretAccessKey: process.env.S3_SECRET_KEY,
                      }
                    : undefined,
        });
    }
    return s3Client;
}

export function getBucket() {
    if (!process.env.S3_BUCKET) {
        throw new Error("S3_BUCKET is required.");
    }
    return process.env.S3_BUCKET;
}

export async function extractGameFile(gameFile: File) {
    const zip = new JSZip();
    return await zip.loadAsync(await gameFile.arrayBuffer());
}

export async function validateGameZip(
    gameZip: JSZip,
): Promise<ContentErrorResponse | undefined> {
    const gameJsonFile = gameZip.file("game.json");
    if (!gameJsonFile) {
        console.warn('rejected game file (reason = "NoGameJson")');
        return {
            ok: false,
            reason: "NoGameJson",
        };
    }
    let gameJson: unknown;
    try {
        gameJson = JSON.parse(await gameJsonFile.async("text"));
    } catch (err) {
        // SyntaxError のメッセージには入力の断片 (改行・制御文字を含みうる) が埋め込まれるため、エスケープして載せる
        console.warn(
            'rejected game file (reason = "InvalidGameJson", error = %s)',
            formatValue(err instanceof Error ? err.message : String(err)),
        );
        return {
            ok: false,
            reason: "InvalidGameJson",
        };
    }
    const { error } = checkGameJsonEnvironment(gameJson);
    if (error) {
        console.warn(
            'rejected game file (reason = "%s", environment = %s)',
            error.reason,
            formatValue(getGameJsonEnvironment(gameJson), 1000),
        );
        return {
            ok: false,
            ...error,
        };
    }
    // 切り捨てて記録すると、必須のプラグインが外部では「なくても動く」扱いになるため受け付けない
    if (
        exceedsContentExternalLimits(
            listContentExternals(gameJson as GameConfiguration),
        )
    ) {
        console.warn('rejected game file (reason = "ExternalLimitExceeded")');
        return {
            ok: false,
            reason: "ExternalLimitExceeded",
        };
    }
}

/**
 * validateGameZip を通った後に呼ぶこと
 */
export async function listGameZipExternals(gameZip: JSZip) {
    const gameJson = JSON.parse(await gameZip.file("game.json")!.async("text"));
    return listContentExternals(gameJson);
}

/**
 * Server Action はブラウザ外から任意の引数で呼べるため、文字列の配列以外は無視する
 */
export function parseRequiredExternals(requiredExternals: unknown) {
    return new Set(
        Array.isArray(requiredExternals)
            ? requiredExternals.filter(
                  (name): name is string => typeof name === "string",
              )
            : [],
    );
}

/**
 * S3 へ置き終えるまで Content の行を作らずに、置き場所に使う ID だけを先に払い出す。
 * WHY: 行があると最新バージョンとして一覧・外部 API から見え、置いている途中のゲームを起動されてしまう
 */
export async function allocateContentId() {
    const [{ id }] = await prisma.$queryRaw<{ id: bigint }[]>`
        SELECT nextval(pg_get_serial_sequence('"Content"', 'id')) AS id
    `;
    return Number(id);
}

/**
 * Content と使用プラグインを 1 回の作成で書くためのデータ。
 * 必須かどうかは、実際に使っているプラグインのうち requiredExternals に含まれるもの。
 */
export function toContentCreateData(
    contentId: number,
    iconPath: string,
    externals: string[],
    requiredExternals: unknown,
) {
    const required = parseRequiredExternals(requiredExternals);
    return {
        id: contentId,
        icon: iconPath,
        scoreboard: externals.includes("scoreboard"),
        externalsRecorded: true,
        externals: {
            create: externals.map((name) => ({
                name,
                required: required.has(name),
            })),
        },
    };
}

export function toIconPath(iconFile: File) {
    return (
        "icon" + randomBytes(3).toString("hex") + path.extname(iconFile.name)
    );
}

export async function throwIfInvalidContentDir(contentId: number) {
    const res = await getS3Client().send(
        new ListObjectsV2Command({
            Bucket: getBucket(),
            Prefix: `${s3KeyPrefix}${contentId}/`,
            MaxKeys: 1,
        }),
    );
    if (res.Contents && res.Contents.length > 0) {
        throw new Error(
            `failed to create content directory (contentId = "${contentId}", reason = "already exists ${getBucket()}/${contentId}")`,
        );
    }
}

async function extractFile(contentId: number, file: JSZipObject) {
    if (file.dir) {
        return;
    }
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: getBucket(),
            Key: `${s3KeyPrefix}${contentId}/${file.name}`,
            Body: await file.async("nodebuffer"),
            ContentType: contentTypeFromName(file.name),
        }),
    );
}

export async function deployGameZip(contentId: number, gameZip: JSZip) {
    await Promise.all(
        Object.values(gameZip.files).map(
            async (file) => await extractFile(contentId, file),
        ),
    );
}

export async function deployIconFile(
    contentId: number,
    iconPath: string,
    iconFile: File,
) {
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: getBucket(),
            Key: `${s3KeyPrefix}${contentId}/${iconPath}`,
            Body: await iconFile.bytes(),
            ContentType: contentTypeFromName(iconPath),
        }),
    );
}

export async function deleteContentDir(contentId: number) {
    await deleteS3Prefix(`${contentId}/`);
}

/** コンテンツ配信用のバケットから、`prefix` 以下を丸ごと消す */
export async function deleteS3Prefix(prefix: string) {
    let continuationToken: string | undefined;
    do {
        const res = await getS3Client().send(
            new ListObjectsV2Command({
                Bucket: getBucket(),
                Prefix: `${s3KeyPrefix}${prefix}`,
                ContinuationToken: continuationToken,
            }),
        );
        const objects = (res.Contents ?? [])
            .map((obj) => obj.Key)
            .filter((key) => Boolean(key))
            .map((key) => ({ Key: key }));
        if (objects.length > 0) {
            await getS3Client().send(
                new DeleteObjectsCommand({
                    Bucket: getBucket(),
                    Delete: {
                        Objects: objects,
                        Quiet: true,
                    },
                }),
            );
        }
        continuationToken = res.NextContinuationToken;
    } while (continuationToken);
}
