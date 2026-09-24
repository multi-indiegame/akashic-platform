import { prisma, ScoreTitleRank } from "@multi-indiegame/persist-schema";

/**
 * 称号の付与。
 *
 * WHY: サインイン利用者にだけ付ける。ゲストは identity が Cookie 依存で続かず、
 * 積み上げた称号を持ち主に結び付けられない。
 */

/** 段位の強さ。同じカテゴリでは大きいほうを残す */
const RANK_ORDER: { [key in ScoreTitleRank]: number } = {
    NONE: 0,
    BRONZE: 1,
    SILVER: 2,
    GOLD: 3,
};

export type ConditionOperator = ">=" | ">" | "<=" | "<" | "==";

/** 記録のキーを見る条件 */
export interface FieldCondition {
    field: string;
    /** 何を見るか。省略すると最良値 */
    of?: "best" | "latest" | "sum" | "count";
    op: ConditionOperator;
    value: number | boolean;
}

/** そのゲームで積み上げた数を見る条件 */
export interface StatCondition {
    stat: "playCount";
    op: ConditionOperator;
    value: number;
}

export type TitleCondition = FieldCondition | StatCondition;

export interface TitleConditionSet {
    /** すべて満たしたときに付与する */
    all: TitleCondition[];
}

export interface TitleContext {
    playCount: number;
    /** キーごとの集計 */
    fields: {
        [key: string]: {
            max: number | null;
            min: number | null;
            sum: number;
            count: number;
            /** true を記録した回数。boolean のキーの「達成回数」 */
            trueCount: number;
            last: number | null;
            lastBool: boolean | null;
        };
    };
}

/**
 * 1 人分の称号を評価して、到達していれば付け替える。
 *
 * WHY: 同じカテゴリでは最上位だけを残す。下位に戻すことはしない（いちど
 * 達成した段位は取り上げない）。
 */
export async function awardTitles(
    userId: string,
    gameId: number,
): Promise<void> {
    const defs = await prisma.scoreTitleDef.findMany({
        // WHY: 取り下げた定義では新たに付与しない。すでに獲得した分は残る
        where: { gameId, retiredAt: null },
        select: {
            id: true,
            categoryKey: true,
            rank: true,
            condition: true,
        },
    });
    if (defs.length === 0) {
        return;
    }
    const context = await buildContext(userId, gameId);
    const held = await prisma.scoreTitle.findMany({
        where: { userId, gameId },
        select: { categoryKey: true, rank: true },
    });
    const heldByCategory = new Map(held.map((row) => [row.categoryKey, row]));

    // カテゴリごとに、満たしている中でいちばん上の段位を選ぶ
    const bestByCategory = new Map<string, (typeof defs)[number]>();
    for (const def of defs) {
        if (!matches(def.condition, context)) {
            continue;
        }
        const current = bestByCategory.get(def.categoryKey);
        if (!current || RANK_ORDER[def.rank] > RANK_ORDER[current.rank]) {
            bestByCategory.set(def.categoryKey, def);
        }
    }
    for (const [categoryKey, def] of bestByCategory) {
        const existing = heldByCategory.get(categoryKey);
        if (existing && RANK_ORDER[existing.rank] >= RANK_ORDER[def.rank]) {
            continue;
        }
        await prisma.scoreTitle.upsert({
            where: {
                userId_gameId_categoryKey: { userId, gameId, categoryKey },
            },
            create: {
                userId,
                gameId,
                categoryKey,
                rank: def.rank,
                defId: def.id,
            },
            update: { rank: def.rank, defId: def.id, awardedAt: new Date() },
        });
        await notifyAwarded(userId, gameId, def.id, !!existing);
    }
}

/**
 * 称号が付いたことを本人に知らせる。
 */
async function notifyAwarded(
    userId: string,
    gameId: number,
    defId: number,
    upgraded: boolean,
): Promise<void> {
    try {
        const [def, game] = await Promise.all([
            prisma.scoreTitleDef.findUnique({
                where: { id: defId },
                select: { name: true },
            }),
            prisma.game.findUnique({
                where: { id: gameId },
                select: { title: true },
            }),
        ]);
        if (!def || !game) {
            return;
        }
        await prisma.notification.create({
            data: {
                userId,
                unread: true,
                type: "TITLE_AWARDED",
                // WHY: 同じ配信元の画面で出すので相対で足りる。このパッケージは
                // 実行基盤と webapp の双方から読まれ、配信元の設定を持たない
                iconURL: `/api/game/${gameId}/icon`,
                body: upgraded
                    ? `"${game.title}" の称号が「${def.name}」に上がりました。`
                    : `"${game.title}" の称号「${def.name}」を獲得しました。`,
                link: "/my-stats",
            },
        });
    } catch (_err) {
        // WHY: 知らせられなくても称号は取り消さない。
    }
}

async function buildContext(
    userId: string,
    gameId: number,
): Promise<TitleContext> {
    const subjectKey = `u:${userId}`;
    const [plays, bests] = await Promise.all([
        prisma.scorePlayCount.findUnique({
            where: { gameId_subjectKey: { gameId, subjectKey } },
            select: { count: true },
        }),
        prisma.scoreBest.findMany({
            where: { gameId, subjectKey },
            select: {
                key: true,
                maxValue: true,
                minValue: true,
                sum: true,
                count: true,
                trueCount: true,
                lastValue: true,
                lastBool: true,
            },
        }),
    ]);
    return {
        playCount: plays?.count ?? 0,
        fields: Object.fromEntries(
            bests.map((row) => [
                row.key,
                {
                    max: row.maxValue,
                    min: row.minValue,
                    sum: row.sum,
                    count: row.count,
                    trueCount: row.trueCount,
                    last: row.lastValue,
                    lastBool: row.lastBool,
                },
            ]),
        ),
    };
}

export function matches(raw: unknown, context: TitleContext): boolean {
    const set = normalizeCondition(raw);
    if (!set || set.all.length === 0) {
        return false;
    }
    return set.all.every((condition) => matchesOne(condition, context));
}

function matchesOne(condition: TitleCondition, context: TitleContext): boolean {
    if ("stat" in condition) {
        return compare(context.playCount, condition.op, condition.value);
    }
    const field = context.fields[condition.field];
    if (!field) {
        return false;
    }
    if (typeof condition.value === "boolean") {
        return field.lastBool === condition.value;
    }
    const actual = pick(field, condition.of ?? "best", condition.op);
    if (actual == null) {
        return false;
    }
    return compare(actual, condition.op, condition.value);
}

/**
 * WHY: 「最良値」が最大か最小かは、条件の向きで決まる。`score >= 10000` なら
 * 最大値を、`time <= 30` なら最小値を見るのが投稿者の意図に合う。
 */
function pick(
    field: TitleContext["fields"][string],
    of: NonNullable<FieldCondition["of"]>,
    op: ConditionOperator,
): number | null {
    switch (of) {
        case "best":
            return op === "<=" || op === "<" ? field.min : field.max;
        case "latest":
            return field.last;
        case "sum":
            return field.count > 0 ? field.sum : null;
        case "count":
            // WHY: 数値を持たないキーでは、達成した回数を「回数」とみなす。
            // boolean は達成したときだけ報告される（達成しなかったことは
            // 報告されない）ので、件数ではなく true の回数が意図に合う
            return field.count > 0 ? field.count : field.trueCount;
    }
}

function compare(
    actual: number,
    op: ConditionOperator,
    expected: number | boolean,
): boolean {
    if (typeof expected !== "number") {
        return false;
    }
    switch (op) {
        case ">=":
            return actual >= expected;
        case ">":
            return actual > expected;
        case "<=":
            return actual <= expected;
        case "<":
            return actual < expected;
        case "==":
            return actual === expected;
    }
}

export function normalizeCondition(raw: unknown): TitleConditionSet | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const all = (raw as { all?: unknown }).all;
    if (!Array.isArray(all)) {
        return null;
    }
    const conditions: TitleCondition[] = [];
    for (const item of all) {
        if (!item || typeof item !== "object") {
            return null;
        }
        const source = item as Record<string, unknown>;
        if (!isOperator(source.op)) {
            return null;
        }
        if (typeof source.stat === "string") {
            if (
                source.stat !== "playCount" ||
                typeof source.value !== "number"
            ) {
                return null;
            }
            conditions.push({
                stat: "playCount",
                op: source.op,
                value: source.value,
            });
            continue;
        }
        if (typeof source.field !== "string" || !source.field) {
            return null;
        }
        if (
            typeof source.value !== "number" &&
            typeof source.value !== "boolean"
        ) {
            return null;
        }
        const of = source.of;
        if (
            of != null &&
            !["best", "latest", "sum", "count"].includes(String(of))
        ) {
            return null;
        }
        conditions.push({
            field: source.field,
            of: of as FieldCondition["of"],
            op: source.op,
            value: source.value,
        });
    }
    return { all: conditions };
}

function isOperator(value: unknown): value is ConditionOperator {
    return (
        typeof value === "string" &&
        [">=", ">", "<=", "<", "=="].includes(value)
    );
}

/**
 * ゲーム全体の称号を付け直す。
 *
 * WHY: 定義を変えたときに投稿者が押す。既定では以後のプレイから適用し、
 * さかのぼらない。走査するのは掲載済みの主体だけで、行数は参加者数に比例する。
 */
export async function reevaluateTitles(gameId: number): Promise<number> {
    const subjects = await prisma.scorePlayCount.findMany({
        where: { gameId, subjectKey: { startsWith: "u:" } },
        select: { subjectKey: true },
    });
    for (const { subjectKey } of subjects) {
        await awardTitles(subjectKey.slice(2), gameId);
    }
    return subjects.length;
}
