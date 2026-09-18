"use server";

import { prisma } from "@multi-indiegame/persist-schema";
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
    deployIconFile,
    GameForm,
    toIconPath,
    validateGameZip,
    deleteContentDir,
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

async function createGameRecord(param: NewGameForm) {
    return (
        await prisma.game.create({
            data: {
                publisherId: param.publisherId,
                title: param.title,
                description: param.description,
                credit: param.credit,
                streaming: param.streaming,
            },
        })
    ).id;
}

async function deleteGameRecord(gameId: number) {
    await prisma.game.delete({
        where: {
            id: gameId,
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
        const gameId = await createGameRecord(param);
        try {
            const iconPath = toIconPath(param.iconFile);
            const contentId = await createContentRecord(gameId, iconPath);
            try {
                await throwIfInvalidContentDir(contentId);
                await deployGameZip(contentId, gameZip);
                await deployIconFile(contentId, iconPath, param.iconFile);
                return {
                    ok: true,
                    contentId,
                };
            } catch (err) {
                await deleteContentRecord(contentId);
                await deleteContentDir(contentId);
                throw err;
            }
        } catch (err) {
            await deleteGameRecord(gameId);
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
