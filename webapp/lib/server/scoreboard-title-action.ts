"use server";

import { prisma } from "@multi-indiegame/persist-schema";
import type { ScoreTitleRank } from "@multi-indiegame/persist-schema";
import {
    TitleCondition,
    normalizeCondition,
} from "@multi-indiegame/scoreboard-schema";
import { titleRanks } from "../types";
import { publicContentBaseUrl } from "./akashic";
import {
    deleteTitleImage,
    isAllowedTitleImage,
    toTitleImageKey,
    uploadTitleImage,
} from "./title-image";
import { getSignedInUser } from "./auth";
import { isWriteBlocked } from "./drain-state";
import { logSafe } from "./log-safe";

const NAME_MAX_LENGTH = 20;
const IMAGE_CREDIT_MAX_LENGTH = 200;
const CATEGORY_MAX_LENGTH = 32;

/**
 * カテゴリ名の形式。記録のキーと同じにそろえる。
 */
const CATEGORY_PATTERN = /^[a-zA-Z0-9_:-]{1,32}$/;

const titleErrReasons = [
    "InvalidParams",
    "NotFound",
    "Unauthorized",
    "InternalError",
    "Drain",
] as const;
type TitleErrorType = (typeof titleErrReasons)[number];

export type SaveTitleResponse =
    { ok: true } | { ok: false; reason: TitleErrorType };

export interface TitleDefInput {
    /** 既存を直すときだけ。新しく作るときは省く */
    id?: number;
    categoryKey: string;
    rank: ScoreTitleRank;
    priority: number;
    name: string;
    condition: { all: TitleCondition[] };
    /** 画像の出どころ。表示が求められる素材のために持つ */
    imageCredit?: string;
}

export interface TitleDefRow {
    id: number;
    categoryKey: string;
    rank: ScoreTitleRank;
    priority: number;
    name: string;
    condition: { all: TitleCondition[] };
    /** アップロードした画像。無ければ段位の既定の画像を出す */
    imageURL?: string;
    imageCredit?: string;
    retired: boolean;
    /** すでに獲得した人の数。取り下げるか消せるかの判断に使う */
    awardedCount: number;
}

export interface TitleEditorData {
    defs: TitleDefRow[];
    /** 条件に使えるキー。実際に記録されているものと、投稿者が決めたもの */
    keys: string[];
}

async function requirePublisher(gameId: number) {
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return { ok: false as const, reason: auth.reason };
    }
    const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { publisherId: true },
    });
    if (!game) {
        return { ok: false as const, reason: "NotFound" as const };
    }
    if (game.publisherId !== auth.user.id) {
        return { ok: false as const, reason: "Unauthorized" as const };
    }
    return { ok: true as const, userId: auth.user.id };
}

/** 編集画面に出す、いまの称号と条件に使えるキー */
export async function fetchTitleEditorData(
    gameId: number,
): Promise<TitleEditorData | null> {
    const auth = await requirePublisher(gameId);
    if (!auth.ok) {
        return null;
    }
    const [defs, keys, format] = await Promise.all([
        prisma.scoreTitleDef.findMany({
            where: { gameId },
            orderBy: [{ priority: "asc" }, { id: "asc" }],
            select: {
                id: true,
                categoryKey: true,
                rank: true,
                priority: true,
                name: true,
                condition: true,
                imageKey: true,
                imageCredit: true,
                retiredAt: true,
                _count: { select: { titles: true } },
            },
        }),
        prisma.scoreValue.findMany({
            where: { gameId, record: { playerId: { not: null } } },
            distinct: ["key"],
            select: { key: true },
            orderBy: { key: "asc" },
        }),
        prisma.scoreboardFormat.findFirst({
            where: { gameId },
            orderBy: { version: "desc" },
            select: { definition: true },
        }),
    ]);
    const configured = Object.keys(
        (format?.definition as { fields?: object } | null)?.fields ?? {},
    );
    return {
        defs: defs.map((def) => ({
            id: def.id,
            categoryKey: def.categoryKey,
            rank: def.rank,
            priority: def.priority,
            name: def.name,
            condition: normalizeCondition(def.condition) ?? { all: [] },
            imageURL: def.imageKey
                ? `${publicContentBaseUrl}/${def.imageKey}`
                : undefined,
            imageCredit: def.imageCredit ?? undefined,
            retired: !!def.retiredAt,
            awardedCount: def._count.titles,
        })),
        keys: [
            ...new Set([...keys.map((row) => row.key), ...configured]),
        ].sort(),
    };
}

/** 称号を作る、または直す */
export async function saveTitleDef(
    gameId: number,
    input: TitleDefInput,
): Promise<SaveTitleResponse> {
    if (isWriteBlocked()) {
        return { ok: false, reason: "Drain" };
    }
    if (!Number.isSafeInteger(gameId)) {
        return { ok: false, reason: "InvalidParams" };
    }
    const auth = await requirePublisher(gameId);
    if (!auth.ok) {
        return { ok: false, reason: auth.reason };
    }
    const name = input.name?.trim() ?? "";
    if (!name || name.length > NAME_MAX_LENGTH) {
        return { ok: false, reason: "InvalidParams" };
    }
    const categoryKey = input.categoryKey?.trim() ?? "";
    if (
        !CATEGORY_PATTERN.test(categoryKey) ||
        categoryKey.length > CATEGORY_MAX_LENGTH
    ) {
        return { ok: false, reason: "InvalidParams" };
    }
    if (!titleRanks.includes(input.rank)) {
        return { ok: false, reason: "InvalidParams" };
    }
    if (!Number.isSafeInteger(input.priority) || input.priority < 0) {
        return { ok: false, reason: "InvalidParams" };
    }
    const imageCredit = input.imageCredit?.trim() ?? "";
    if (imageCredit.length > IMAGE_CREDIT_MAX_LENGTH) {
        return { ok: false, reason: "InvalidParams" };
    }
    // WHY: 条件はそのまま保存せず、評価に使うのと同じ関数で読み直す。読めない
    // 条件は、保存できても誰にも付かない
    const condition = normalizeCondition(input.condition);
    if (!condition || condition.all.length === 0) {
        return { ok: false, reason: "InvalidParams" };
    }
    try {
        const data = {
            gameId,
            categoryKey,
            rank: input.rank,
            priority: input.priority,
            name,
            imageCredit: imageCredit || null,
            condition: JSON.parse(JSON.stringify(condition)),
        };
        if (input.id) {
            await prisma.scoreTitleDef.update({
                where: { id: input.id },
                // 取り下げた称号を直したときは、配布を再開したとみなす
                data: { ...data, retiredAt: null },
            });
        } else {
            await prisma.scoreTitleDef.create({ data });
        }
        return { ok: true };
    } catch (err) {
        console.warn(
            "failed to save title definition (gameId = %s)",
            logSafe(gameId),
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}

/**
 * 称号を配布するのをやめる。
 *
 * **すでに獲得した人の称号は残る。** 誰も獲得していなければ、定義そのものを消す。
 */
export async function retireTitleDef(
    gameId: number,
    defId: number,
): Promise<SaveTitleResponse> {
    if (isWriteBlocked()) {
        return { ok: false, reason: "Drain" };
    }
    const auth = await requirePublisher(gameId);
    if (!auth.ok) {
        return { ok: false, reason: auth.reason };
    }
    try {
        const def = await prisma.scoreTitleDef.findFirst({
            where: { id: defId, gameId },
            select: {
                id: true,
                imageKey: true,
                _count: { select: { titles: true } },
            },
        });
        if (!def) {
            return { ok: false, reason: "NotFound" };
        }
        if (def._count.titles === 0) {
            await prisma.scoreTitleDef.delete({ where: { id: def.id } });
            if (def.imageKey) {
                await deleteTitleImage(def.imageKey);
            }
        } else {
            await prisma.scoreTitleDef.update({
                where: { id: def.id },
                data: { retiredAt: new Date() },
            });
        }
        return { ok: true };
    } catch (err) {
        console.warn(
            "failed to retire title definition (gameId = %s)",
            logSafe(gameId),
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}

/**
 * 称号の画像を差し替える。
 *
 * WHY: 称号を作るより先に画像だけ置くと、どの称号のものか分からないまま残る。
 * 保存して id が決まってから受け取る。
 */
export async function replaceTitleImage(
    gameId: number,
    defId: number,
    form: FormData,
): Promise<SaveTitleResponse> {
    if (isWriteBlocked()) {
        return { ok: false, reason: "Drain" };
    }
    const auth = await requirePublisher(gameId);
    if (!auth.ok) {
        return { ok: false, reason: auth.reason };
    }
    const file = form.get("image");
    if (!(file instanceof File) || !isAllowedTitleImage(file)) {
        return { ok: false, reason: "InvalidParams" };
    }
    try {
        const def = await prisma.scoreTitleDef.findFirst({
            where: { id: defId, gameId },
            select: { id: true, imageKey: true },
        });
        if (!def) {
            return { ok: false, reason: "NotFound" };
        }
        const key = toTitleImageKey(gameId, def.id, file);
        await uploadTitleImage(key, file);
        await prisma.scoreTitleDef.update({
            where: { id: def.id },
            data: { imageKey: key },
        });
        if (def.imageKey) {
            await deleteTitleImage(def.imageKey);
        }
        return { ok: true };
    } catch (err) {
        console.warn(
            "failed to replace title image (gameId = %s)",
            logSafe(gameId),
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}

/** 設定した称号の画像を削除する */
export async function removeTitleImage(
    gameId: number,
    defId: number,
): Promise<SaveTitleResponse> {
    if (isWriteBlocked()) {
        return { ok: false, reason: "Drain" };
    }
    const auth = await requirePublisher(gameId);
    if (!auth.ok) {
        return { ok: false, reason: auth.reason };
    }
    try {
        const def = await prisma.scoreTitleDef.findFirst({
            where: { id: defId, gameId },
            select: { id: true, imageKey: true },
        });
        if (!def) {
            return { ok: false, reason: "NotFound" };
        }
        await prisma.scoreTitleDef.update({
            where: { id: def.id },
            data: { imageKey: null },
        });
        if (def.imageKey) {
            await deleteTitleImage(def.imageKey);
        }
        return { ok: true };
    } catch (err) {
        console.warn(
            "failed to remove title image (gameId = %s)",
            logSafe(gameId),
            err,
        );
        return { ok: false, reason: "InternalError" };
    }
}
