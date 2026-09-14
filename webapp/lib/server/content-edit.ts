"use server";

import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@yasshi2525/persist-schema";
import {
    ContentErrorResponse,
    ContentResponse,
    GAME_FILE_MAX_BYTES,
    ICON_FILE_MAX_BYTES,
} from "../types";
import {
    createContentRecord,
    deleteContentRecord,
    extractGameFile,
    deployGameZip,
    GameForm,
    toIconPath,
    validateGameZip,
    deployIconFile,
    deleteContentDir,
    throwIfInvalidContentDir,
    getBucket,
    getS3Client,
    s3KeyPrefix,
    contentTypeFromName,
} from "./content-utils";
import { isWriteBlocked } from "./drain-state";
import { getAuth } from "./auth";

interface EditGameRequest extends Partial<GameForm> {
    gameId: number;
    contentId: number;
}

interface EditGameForm extends EditGameRequest {
    publisherId: string;
}

async function validateParam({
    gameId,
    contentId,
    publisherId,
    gameFile,
    iconFile,
}: EditGameForm): Promise<ContentErrorResponse | undefined> {
    if (gameId == null || contentId == null || !publisherId) {
        return {
            ok: false,
            reason: "InvalidParams",
        };
    }
    if (gameFile && gameFile.size > GAME_FILE_MAX_BYTES) {
        return {
            ok: false,
            reason: "GameFileTooLarge",
        };
    }
    if (iconFile && iconFile.size > ICON_FILE_MAX_BYTES) {
        return {
            ok: false,
            reason: "IconFileTooLarge",
        };
    }
    try {
        const game = await prisma.game.findUniqueOrThrow({
            select: {
                publisherId: true,
            },
            where: {
                id: gameId,
            },
        });
        if (game.publisherId !== publisherId) {
            return {
                ok: false,
                reason: "InvalidParams",
            };
        }
        const content = await prisma.content.findUniqueOrThrow({
            select: {
                gameId: true,
            },
            where: {
                id: contentId,
            },
        });
        // contentId はアイコンの上書き先・コピー元になるため、他人のゲームの
        // バージョンを指定されないよう所有者確認済みの gameId に属するか確かめる
        if (content.gameId !== gameId) {
            return {
                ok: false,
                reason: "InvalidParams",
            };
        }
    } catch (err) {
        console.warn(
            'failed to register content (pulisherId = "%s", gameId = "%s")',
            publisherId,
            gameId,
            err,
        );
        return {
            ok: false,
            reason: "InternalError",
        };
    }
}

async function updateGameRecord({
    gameId,
    title,
    description,
    credit,
    streaming,
}: EditGameForm) {
    const data: Awaited<Parameters<typeof prisma.game.update>[0]["data"]> = {};
    if (title != null) {
        data.title = title;
    }
    if (description != null) {
        data.description = description;
    }
    if (credit != null) {
        data.credit = credit;
    }
    if (streaming != null) {
        data.streaming = streaming;
    }
    if (Object.keys(data).length === 0) {
        return;
    }
    await prisma.game.update({
        data,
        where: {
            id: gameId,
        },
    });
}

async function updateContentRecord(contentId: number, iconPath: string) {
    await prisma.content.update({
        data: {
            icon: iconPath,
        },
        where: {
            id: contentId,
        },
    });
}

async function getIconPath(contentId: number) {
    return (
        await prisma.content.findUniqueOrThrow({
            select: {
                icon: true,
            },
            where: {
                id: contentId,
            },
        })
    ).icon;
}

export async function copyIconFile(
    fromContentId: number,
    toContentId: number,
    iconPath: string,
) {
    const bucket = getBucket();
    await getS3Client().send(
        new CopyObjectCommand({
            Bucket: bucket,
            Key: `${s3KeyPrefix}${toContentId}/${iconPath}`,
            CopySource: `${bucket}/${s3KeyPrefix}${fromContentId}/${iconPath}`,
            // コピー元（旧アイコン）に Content-Type が無い場合でも正しく付与するため
            // メタデータを引き継がず再設定する
            MetadataDirective: "REPLACE",
            ContentType: contentTypeFromName(iconPath),
        }),
    );
}

export async function editContent(
    request: EditGameRequest,
): Promise<ContentResponse> {
    if (isWriteBlocked()) {
        return {
            ok: false,
            reason: "Drain",
        };
    }
    // 所有者判定に使う id はクライアントから受け取らずセッションから決める
    // (理由は registerContent と同じ)
    const user = await getAuth();
    if (user?.authType !== "oauth") {
        return {
            ok: false,
            reason: "Unauthorized",
        };
    }
    const param: EditGameForm = { ...request, publisherId: user.id };
    const validationErrParam = await validateParam(param);
    if (validationErrParam) {
        return validationErrParam;
    }
    try {
        if (param.gameFile) {
            const gameZip = await extractGameFile(param.gameFile);
            const validationErrGameZip = await validateGameZip(gameZip);
            if (validationErrGameZip) {
                return validationErrGameZip;
            }
            const iconPath = param.iconFile
                ? toIconPath(param.iconFile)
                : await getIconPath(param.contentId);
            const newContentId = await createContentRecord(
                param.gameId,
                iconPath,
            );
            try {
                await throwIfInvalidContentDir(newContentId);
                await deployGameZip(newContentId, gameZip);
                if (param.iconFile) {
                    await deployIconFile(
                        newContentId,
                        iconPath,
                        param.iconFile,
                    );
                } else {
                    await copyIconFile(param.contentId, newContentId, iconPath);
                }
                await updateGameRecord(param);
                return {
                    ok: true,
                    contentId: newContentId,
                };
            } catch (err) {
                await deleteContentRecord(newContentId);
                await deleteContentDir(newContentId);
                throw err;
            }
        } else {
            if (param.iconFile) {
                const iconPath = toIconPath(param.iconFile);
                await deployIconFile(param.contentId, iconPath, param.iconFile);
                await updateContentRecord(param.contentId, iconPath);
            }
            await updateGameRecord(param);
            return {
                ok: true,
                contentId: param.contentId,
            };
        }
    } catch (err) {
        console.warn(
            'failed to edit content (contentId = "%s")',
            param.contentId,
            err,
        );
        return {
            ok: false,
            reason: "InternalError",
        };
    }
}
