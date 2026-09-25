import { prisma } from "@multi-indiegame/persist-schema";
import { ScoreFieldSetting, fetchFormat, fieldSetting } from "./format";
import { awardTitles } from "./title";

/**
 * 記録の掲載可否を決める突き合わせ。
 *
 * WHY: 同意はブラウザにしか現れず、実行基盤からは見えない。記録を集める経路
 * （runner → akashic-server）と、同意を集める経路（ブラウザ → webapp）は互いを
 * 待たずに進み、両方が揃ったものだけがここで掲載用に入る。
 *
 * **判定はこのモジュールだけが行う。** 実行基盤にも表示側にも持ち込まない。
 * 突き合わせが動かなければ何も載らない、という壊れ方（fail-closed）にしておく。
 *
 * WHY: akashic-server と webapp の双方から呼べるよう、独立したパッケージに置く。
 * 同じ判定を 2 か所に書くと、片方だけ直したときに食い違う。
 */

/**
 * 歴代ランキングとして保つ件数。
 *
 * WHY: 表示は 10 件でも、撤回で抜けた分や、投稿者が表示件数を増やしたときの
 * ために余裕を持たせる。一度こぼれた記録は戻らないので、多めに持っておかないと
 * 後から増やせない。
 */
const TOP_ENTRY_LIMIT = 100;

export * from "./format";
export * from "./title";

/** 掲載してよい相手を表す鍵 */
export type SubjectKey = string;

/**
 * 参加者から掲載用の鍵を作る。
 *
 * WHY: ゲストは `guest_id`（認証 Cookie の秘密）ではなく in-game playerId を使う。
 * playerId は Join で参加者へ配られる公開値で、同一端末なら常に同じ派生値になる
 * ため、プレイをまたいだ同一人物の判定にも使える。
 */
export function toSubjectKey(participant: {
    userId: string | null;
    playerId: string;
}): SubjectKey {
    return participant.userId
        ? `u:${participant.userId}`
        : `g:${participant.playerId}`;
}

export interface ReconcileResult {
    /** 掲載用へ新たに反映した記録の数 */
    reflected: number;
}

/**
 * あるプレイの記録を突き合わせる。
 *
 * いつ何回呼んでもよい。反映済みの記録は `reflectedAt` で弾くので、二重に
 * 加算されない。同意の報告が遅れて届いたら、もう一度呼べばよい。
 */
export async function reconcilePlay(playId: number): Promise<ReconcileResult> {
    const records = await prisma.scoreRecord.findMany({
        where: { playId, reflectedAt: null, excluded: false },
        select: {
            id: true,
            playerId: true,
            gameId: true,
            endedAt: true,
            values: {
                select: {
                    key: true,
                    numValue: true,
                    strValue: true,
                    boolValue: true,
                },
            },
        },
    });
    if (records.length === 0) {
        return { reflected: 0 };
    }
    const participants = await prisma.playParticipant.findMany({
        where: { playId },
        select: {
            playerId: true,
            userId: true,
            nameConsent: true,
            guestName: true,
        },
    });
    // WHY: 掲載をやめた人は、そのプレイで名前を出すことに同意していても掲載
    // しない。以後載せないようここで弾く
    const optedOut = new Set(
        (
            await prisma.user.findMany({
                where: {
                    id: {
                        in: participants
                            .map((p) => p.userId)
                            .filter((id): id is string => !!id),
                    },
                    scoreboardOptOut: true,
                },
                select: { id: true },
            })
        ).map((user) => user.id),
    );
    const byPlayerId = new Map(participants.map((p) => [p.playerId, p]));
    const formats = new Map<number, Awaited<ReturnType<typeof fetchFormat>>>();

    let reflected = 0;
    for (const record of records) {
        // プレイ自体の記録には主体がいない。掲載の同意も要らないので、
        // 主体ごとの集計とは別の置き場へそのまま積む
        if (record.playerId == null) {
            await applyPlayRecord(record);
            reflected++;
            continue;
        }
        const participant = byPlayerId.get(record.playerId);
        // 報告が無い、または同意していない。載せない（既定は非掲載）
        if (!participant || !participant.nameConsent) {
            continue;
        }
        if (participant.userId && optedOut.has(participant.userId)) {
            continue;
        }
        const subjectKey = toSubjectKey({
            userId: participant.userId,
            playerId: record.playerId,
        });
        let format = formats.get(record.gameId);
        if (!format) {
            format = await fetchFormat(record.gameId);
            formats.set(record.gameId, format);
        }
        const resolved = format;
        await applyRecord({
            setting: (key) => fieldSetting(resolved, key),
            recordId: record.id,
            gameId: record.gameId,
            endedAt: record.endedAt,
            subjectKey,
            userId: participant.userId,
            guestName: participant.guestName,
            values: record.values,
        });
        reflected++;
        // WHY: 掲載用へ入った直後に評価する。サインイン利用者だけが対象で、
        // ゲストは identity が続かないため付けない
        if (participant.userId) {
            await awardTitles(participant.userId, record.gameId);
        }
    }
    return { reflected };
}

/**
 * プレイ自体の記録を、ゲーム全体の集計へ積む。
 *
 * WHY: 主体がいないので同意の判定は要らない。掲載するかどうかは投稿者の設定
 * （`playFields`）で決まり、既定では出さない。
 */
async function applyPlayRecord(record: {
    id: number;
    gameId: number;
    endedAt: Date;
    values: {
        key: string;
        numValue: number | null;
        strValue: string | null;
        boolValue: boolean | null;
    }[];
}): Promise<void> {
    await prisma.$transaction(async (tx) => {
        // WHY: 主体ごとの記録と同じく、印を先に立てて二重加算を防ぐ
        const marked = await tx.scoreRecord.updateMany({
            where: { id: record.id, reflectedAt: null },
            data: { reflectedAt: new Date() },
        });
        if (marked.count === 0) {
            return;
        }
        for (const value of record.values) {
            const where = {
                gameId_key: { gameId: record.gameId, key: value.key },
            };
            const existing = await tx.scoreGameTotal.findUnique({
                where,
                select: { maxValue: true, minValue: true },
            });
            const num = value.numValue;
            const updatesMax =
                num != null &&
                (existing?.maxValue == null || num > existing.maxValue);
            const updatesMin =
                num != null &&
                (existing?.minValue == null || num < existing.minValue);
            await tx.scoreGameTotal.upsert({
                where,
                create: {
                    gameId: record.gameId,
                    key: value.key,
                    lastAt: record.endedAt,
                    lastValue: num,
                    lastStr: value.strValue,
                    lastBool: value.boolValue,
                    recordCount: 1,
                    trueCount: value.boolValue === true ? 1 : 0,
                    ...(num != null
                        ? {
                              count: 1,
                              sum: num,
                              maxValue: num,
                              maxAt: record.endedAt,
                              minValue: num,
                              minAt: record.endedAt,
                          }
                        : {}),
                },
                update: {
                    lastAt: record.endedAt,
                    lastValue: num,
                    lastStr: value.strValue,
                    lastBool: value.boolValue,
                    recordCount: { increment: 1 },
                    ...(value.boolValue === true
                        ? { trueCount: { increment: 1 } }
                        : {}),
                    ...(num != null
                        ? {
                              count: { increment: 1 },
                              sum: { increment: num },
                              ...(updatesMax
                                  ? { maxValue: num, maxAt: record.endedAt }
                                  : {}),
                              ...(updatesMin
                                  ? { minValue: num, minAt: record.endedAt }
                                  : {}),
                          }
                        : {}),
                },
            });
        }
    });
}

interface ApplyRecordParameterObject {
    recordId: number;
    gameId: number;
    endedAt: Date;
    subjectKey: SubjectKey;
    userId: string | null;
    guestName: string | null;
    values: {
        key: string;
        numValue: number | null;
        strValue: string | null;
        boolValue: boolean | null;
    }[];
    /** そのキーの引き方。歴代はこの設定の分だけ積む */
    setting: (key: string) => ScoreFieldSetting;
}

async function applyRecord(param: ApplyRecordParameterObject): Promise<void> {
    await prisma.$transaction(async (tx) => {
        // WHY: 反映済みの印を先に立て、同じ条件で 1 件だけ動いたことを確かめる。
        // 同時に 2 回走っても、後から来たほうは 0 件になって加算しない
        const marked = await tx.scoreRecord.updateMany({
            where: { id: param.recordId, reflectedAt: null },
            data: { reflectedAt: new Date(), subjectKey: param.subjectKey },
        });
        if (marked.count === 0) {
            return;
        }
        await tx.scoreValue.updateMany({
            where: { recordId: param.recordId },
            data: { subjectKey: param.subjectKey },
        });
        await tx.scoreSubject.upsert({
            where: { subjectKey: param.subjectKey },
            create: {
                subjectKey: param.subjectKey,
                userId: param.userId,
                guestName: param.guestName,
            },
            // 最後に確定した名前で上書きする
            update: { userId: param.userId, guestName: param.guestName },
        });
        // WHY: 遊んだ回数はサインイン利用者だけ数える。ゲストは identity が
        // Cookie 依存で続かない
        if (param.userId) {
            await tx.scorePlayCount.upsert({
                where: {
                    gameId_subjectKey: {
                        gameId: param.gameId,
                        subjectKey: param.subjectKey,
                    },
                },
                create: {
                    gameId: param.gameId,
                    subjectKey: param.subjectKey,
                    count: 1,
                    lastPlayedAt: param.endedAt,
                },
                update: {
                    count: { increment: 1 },
                    lastPlayedAt: param.endedAt,
                },
            });
        }
        for (const value of param.values) {
            await applyValue(tx, param, value, param.setting(value.key));
        }
    });
}

type TransactionClient = Parameters<
    Parameters<typeof prisma.$transaction>[0]
>[0];

async function applyValue(
    tx: TransactionClient,
    param: ApplyRecordParameterObject,
    value: ApplyRecordParameterObject["values"][number],
    setting: ScoreFieldSetting,
): Promise<void> {
    const where = {
        gameId_key_subjectKey: {
            gameId: param.gameId,
            key: value.key,
            subjectKey: param.subjectKey,
        },
    };
    const existing = await tx.scoreBest.findUnique({
        where,
        select: { maxValue: true, minValue: true },
    });
    const num = value.numValue;
    const updatesMax =
        num != null && (existing?.maxValue == null || num > existing.maxValue);
    const updatesMin =
        num != null && (existing?.minValue == null || num < existing.minValue);
    const data = {
        lastAt: param.endedAt,
        lastValue: num,
        lastStr: value.strValue,
        lastBool: value.boolValue,
        recordCount: { increment: 1 },
        ...(value.boolValue === true ? { trueCount: { increment: 1 } } : {}),
        ...(num != null
            ? {
                  count: { increment: 1 },
                  sum: { increment: num },
                  ...(updatesMax
                      ? { maxValue: num, maxAt: param.endedAt }
                      : {}),
                  ...(updatesMin
                      ? { minValue: num, minAt: param.endedAt }
                      : {}),
              }
            : {}),
    };
    if (num != null) {
        await keepTopEntries(tx, param, value.key, num, setting);
    }
    await tx.scoreBest.upsert({
        where,
        create: {
            gameId: param.gameId,
            key: value.key,
            subjectKey: param.subjectKey,
            lastAt: param.endedAt,
            lastValue: num,
            lastStr: value.strValue,
            lastBool: value.boolValue,
            recordCount: 1,
            trueCount: value.boolValue === true ? 1 : 0,
            ...(num != null
                ? {
                      count: 1,
                      sum: num,
                      maxValue: num,
                      maxAt: param.endedAt,
                      minValue: num,
                      minAt: param.endedAt,
                  }
                : {}),
        },
        update: data,
    });
}

/**
 * 歴代ランキングの上位 N 件を保つ。
 *
 * WHY: 差し込んで末尾を捨てるだけでよい。こぼれた記録が上位へ戻ることはないので、
 * 元の記録を消した後もランキングは保たれる。
 *
 * WHY: いまの設定の向きで 1 本だけ持つ。設定が変わったら積み直す（`rebuildKey`）。
 */
async function keepTopEntries(
    tx: TransactionClient,
    param: ApplyRecordParameterObject,
    key: string,
    value: number,
    setting: ScoreFieldSetting,
): Promise<void> {
    if (setting.dedupe !== "all") {
        return;
    }
    await tx.scoreTopEntry.create({
        data: {
            gameId: param.gameId,
            key,
            value,
            subjectKey: param.subjectKey,
            recordId: param.recordId,
            endedAt: param.endedAt,
        },
    });
    // 同値のときは先に達成したほうを上位に置く
    const overflow = await tx.scoreTopEntry.findMany({
        where: { gameId: param.gameId, key },
        orderBy: [
            { value: setting.direction === "high" ? "desc" : "asc" },
            { endedAt: "asc" },
        ],
        skip: TOP_ENTRY_LIMIT,
        select: { id: true },
    });
    if (overflow.length > 0) {
        await tx.scoreTopEntry.deleteMany({
            where: { id: { in: overflow.map((row) => row.id) } },
        });
    }
}

/**
 * 掲載を取りやめる。
 *
 * 記録そのものは消さない。掲載用から外し、名前が出ない状態へ戻すだけ。
 *
 * WHY: `reflectedAt` は残す。「処理済み」の印なので、消すと次の突き合わせで
 * また掲載されてしまう。外したことを覚えておくために使う。
 */
export async function revokeSubject(subjectKey: SubjectKey): Promise<void> {
    await prisma.$transaction(async (tx) => {
        // 歴代は増分で積んでいるので引き算では戻せない。その主体の分を丸ごと落とす
        await tx.scoreBest.deleteMany({ where: { subjectKey } });
        await tx.scoreTopEntry.deleteMany({ where: { subjectKey } });
        await tx.scorePlayCount.deleteMany({ where: { subjectKey } });
        await tx.scoreSubject.deleteMany({ where: { subjectKey } });
        await tx.scoreValue.updateMany({
            where: { subjectKey },
            data: { subjectKey: null },
        });
        await tx.scoreRecord.updateMany({
            where: { subjectKey },
            data: { subjectKey: null },
        });
    });
}

/**
 * あるキーの歴代を、残っている生レコードから積み直す。
 *
 * 投稿者が引き方を変えたときに呼ぶ。**生レコードが残っている分しか戻らない。**
 * それより前の歴代は失われる、という制約を受け入れることで、設定の組み合わせ
 * ごとに集計を持ち分ける必要がなくなる。
 */
export async function rebuildKey(gameId: number, key: string): Promise<void> {
    const format = await fetchFormat(gameId);
    const setting = fieldSetting(format, key);
    const values = await prisma.scoreValue.findMany({
        where: { gameId, key, subjectKey: { not: null } },
        orderBy: { endedAt: "asc" },
        select: {
            recordId: true,
            subjectKey: true,
            numValue: true,
            strValue: true,
            boolValue: true,
            endedAt: true,
        },
    });
    await prisma.$transaction(async (tx) => {
        await tx.scoreBest.deleteMany({ where: { gameId, key } });
        await tx.scoreTopEntry.deleteMany({ where: { gameId, key } });
        for (const value of values) {
            await applyValue(
                tx,
                {
                    recordId: value.recordId,
                    gameId,
                    endedAt: value.endedAt,
                    subjectKey: value.subjectKey!,
                    userId: null,
                    guestName: null,
                    values: [],
                    setting: () => setting,
                },
                {
                    key,
                    numValue: value.numValue,
                    strValue: value.strValue,
                    boolValue: value.boolValue,
                },
                setting,
            );
        }
    });
}

/**
 * 引き方が変わったキーの歴代を積み直す。
 *
 * WHY: 変わっていないキーは触らない。触ると、生レコードより前の歴代を
 * 失ってしまう
 */
export async function rebuildChangedKeys(
    gameId: number,
    changedKeys: string[],
): Promise<void> {
    for (const key of changedKeys) {
        await rebuildKey(gameId, key);
    }
}
