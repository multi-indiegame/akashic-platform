"use server";

import { prisma } from "@multi-indiegame/persist-schema";
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
    deployIconFile,
    GameForm,
    toContentCreateData,
    toIconPath,
    validateGameZip,
    deleteContentDir,
    listGameZipExternals,
    throwIfInvalidContentDir,
} from "./content-utils";
import { isWriteBlocked } from "./drain-state";
import { getSignedInUser } from "./auth";

interface NewGameForm extends GameForm {
    publisherId: string;
}

function validateParam(param: NewGameForm): ContentErrorResponse | undefined {
    if (
        !param.publisherId ||
        !param.title ||
        !param.gameFile ||
        !param.iconFile ||
        !param.description
    ) {
        return {
            ok: false,
            reason: "InvalidParams",
        };
    }
    if (param.gameFile.size > GAME_FILE_MAX_BYTES) {
        return {
            ok: false,
            reason: "GameFileTooLarge",
        };
    }
    if (param.iconFile.size > ICON_FILE_MAX_BYTES) {
        return {
            ok: false,
            reason: "IconFileTooLarge",
        };
    }
}

/**
 * WHY: S3 に置き終える前のゲームが一覧・外部 API に出ないよう、ゲーム・バージョン・使用プラグインを置いた後にまとめて作る
 */
async function createGameRecord(
    param: NewGameForm,
    contentId: number,
    iconPath: string,
    externals: string[],
) {
    await prisma.game.create({
        data: {
            publisherId: param.publisherId,
            title: param.title,
            description: param.description,
            credit: param.credit,
            streaming: param.streaming,
            externalLaunch: param.externalLaunch === true,
            versions: {
                create: toContentCreateData(
                    contentId,
                    iconPath,
                    externals,
                    param.requiredExternals,
                ),
            },
        },
    });
}

export async function registerContent(
    form: GameForm,
): Promise<ContentResponse> {
    if (isWriteBlocked()) {
        return {
            ok: false,
            reason: "Drain",
        };
    }
    // Server Action はブラウザ外から任意の引数で呼べるため、投稿者はクライアントから
    // 受け取らずセッションから決める
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return {
            ok: false,
            reason: auth.reason,
        };
    }
    const param: NewGameForm = { ...form, publisherId: auth.user.id };
    const validationErrParam = validateParam(param);
    if (validationErrParam) {
        return validationErrParam;
    }
    try {
        const gameZip = await extractGameFile(param.gameFile);
        const validationErrGameZip = await validateGameZip(gameZip);
        if (validationErrGameZip) {
            return validationErrGameZip;
        }
        const externals = await listGameZipExternals(gameZip);
        const iconPath = toIconPath(param.iconFile);
        const contentId = await allocateContentId();
        await throwIfInvalidContentDir(contentId);
        try {
            await deployGameZip(contentId, gameZip);
            await deployIconFile(contentId, iconPath, param.iconFile);
            await createGameRecord(param, contentId, iconPath, externals);
            return {
                ok: true,
                contentId,
            };
        } catch (err) {
            await deleteContentDir(contentId);
            throw err;
        }
    } catch (err) {
        console.warn(
            'failed to register content (pulisherId = "%s")',
            param.publisherId,
            err,
        );
        return {
            ok: false,
            reason: "InternalError",
        };
    }
}
