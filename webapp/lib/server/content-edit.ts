"use server";

import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { Prisma, prisma } from "@multi-indiegame/persist-schema";
import {
    ContentErrorResponse,
    ContentResponse,
    GAME_FILE_MAX_BYTES,
    ICON_FILE_MAX_BYTES,
} from "../types";
import {
    allocateContentId,
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
    listGameZipExternals,
    parseRequiredExternals,
    toContentCreateData,
} from "./content-utils";
import { recordContentExternals } from "./content-get-external";
import { isWriteBlocked } from "./drain-state";
import { getSignedInUser } from "./auth";
import { logSafe } from "./log-safe";

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
            logSafe(publisherId),
            logSafe(gameId),
            err,
        );
        return {
            ok: false,
            reason: "InternalError",
        };
    }
}

async function updateGameRecord(
    tx: Prisma.TransactionClient,
    {
        gameId,
        title,
        description,
        credit,
        streaming,
        externalLaunch,
    }: EditGameForm,
) {
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
    if (externalLaunch != null) {
        data.externalLaunch = externalLaunch === true;
    }
    if (Object.keys(data).length === 0) {
        return;
    }
    await tx.game.update({
        data,
        where: {
            id: gameId,
        },
    });
}

async function getRequiredExternals(contentId: number) {
    return (
        await prisma.contentExternal.findMany({
            select: { name: true },
            where: { contentId, required: true },
        })
    ).map(({ name }) => name);
}

/**
 * ゲームデータを差し替えずに、使用プラグインの必須 / 任意だけを更新する
 */
async function updateContentExternalRecords(
    tx: Prisma.TransactionClient,
    contentId: number,
    required: Set<string>,
) {
    await tx.contentExternal.updateMany({
        data: { required: false },
        where: { contentId, required: true, name: { notIn: [...required] } },
    });
    await tx.contentExternal.updateMany({
        data: { required: true },
        where: { contentId, required: false, name: { in: [...required] } },
    });
}

/**
 * 記録を始める前に投稿されたバージョンは使用プラグインの行を持たないため、要るときだけ game.json から導出して記録する。
 * WHY: 行が要らない編集 (タイトルの修正など) まで、ストレージに届かないだけで失敗させないため
 */
async function recordContentExternalsIfNeeded(
    contentId: number,
    required: Set<string> | undefined,
    externalLaunch: boolean | undefined,
) {
    if (!(required && required.size > 0) && externalLaunch !== true) {
        return;
    }
    const { externalsRecorded } = await prisma.content.findUniqueOrThrow({
        select: { externalsRecorded: true },
        where: { id: contentId },
    });
    if (!externalsRecorded) {
        await recordContentExternals(contentId);
    }
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
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return {
            ok: false,
            reason: auth.reason,
        };
    }
    const param: EditGameForm = { ...request, publisherId: auth.user.id };
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
            const externals = await listGameZipExternals(gameZip);
            const requiredExternals =
                param.requiredExternals ??
                (await getRequiredExternals(param.contentId));
            const iconPath = param.iconFile
                ? toIconPath(param.iconFile)
                : await getIconPath(param.contentId);
            const newContentId = await allocateContentId();
            await throwIfInvalidContentDir(newContentId);
            try {
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
                // WHY: 新しいバージョンが見え始めるのと外部起動の許可の変更を同時にし、
                // 許可を取り消す投稿者の新しいバージョンが外部に一瞬でも出ないようにする
                await prisma.$transaction(async (tx) => {
                    await tx.content.create({
                        data: {
                            gameId: param.gameId,
                            ...toContentCreateData(
                                newContentId,
                                iconPath,
                                externals,
                                requiredExternals,
                            ),
                        },
                    });
                    await updateGameRecord(tx, param);
                });
                return {
                    ok: true,
                    contentId: newContentId,
                };
            } catch (err) {
                await deleteContentDir(newContentId);
                throw err;
            }
        } else {
            const required =
                param.requiredExternals != null
                    ? parseRequiredExternals(param.requiredExternals)
                    : undefined;
            await recordContentExternalsIfNeeded(
                param.contentId,
                required,
                param.externalLaunch,
            );
            const iconPath = param.iconFile
                ? toIconPath(param.iconFile)
                : undefined;
            if (param.iconFile && iconPath) {
                await deployIconFile(param.contentId, iconPath, param.iconFile);
            }
            // WHY: アイコン・必須の申告と外部起動の許可の変更を同時に反映し、
            // 許可を取り消す投稿者の新しいアイコンや、申告前の状態が外部に出ないようにする
            await prisma.$transaction(async (tx) => {
                if (iconPath) {
                    await tx.content.update({
                        data: { icon: iconPath },
                        where: { id: param.contentId },
                    });
                }
                if (required) {
                    await updateContentExternalRecords(
                        tx,
                        param.contentId,
                        required,
                    );
                }
                await updateGameRecord(tx, param);
            });
            return {
                ok: true,
                contentId: param.contentId,
            };
        }
    } catch (err) {
        console.warn(
            'failed to edit content (contentId = "%s")',
            logSafe(param.contentId),
            err,
        );
        return {
            ok: false,
            reason: "InternalError",
        };
    }
}
