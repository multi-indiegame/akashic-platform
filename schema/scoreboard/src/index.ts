import { prisma } from "@multi-indiegame/persist-schema";
import { ScoreDirection, fetchFormat, fieldSetting } from "./format";
import { TransactionClient, lockOptOut } from "./optOut";
import { TitleAward, evaluateTitles, notifyAwarded } from "./title";

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

/**
 * 上位 N 件の積み直しにかけてよい時間。呼び出し側のトランザクションに指定する。
 */
export const TOP_ENTRY_REBUILD_TIMEOUT_MS = 30000;

/**
 * 1 件の反映にかけてよい時間。
 *
 * WHY: 反映は積み直しと同じ鍵を待つ。積み直しが鍵を持っていられる間は
 * 待ち切れるようにする
 */
const REFLECT_TIMEOUT_MS = TOP_ENTRY_REBUILD_TIMEOUT_MS + 10000;

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

    let reflected = 0;
    // WHY: 1 件の失敗で残りを止めない。未反映の記録は、次に突き合わせる
    // ときまで誰にも拾われない
    const errors: unknown[] = [];
    for (const record of records) {
        try {
            // プレイ自体の記録には主体がいない。掲載の同意も要らないので、
            // 主体ごとの集計とは別の置き場へそのまま積む
            if (record.playerId == null) {
                await applyPlayRecord(record);
                reflected++;
                continue;
            }
            const participant = byPlayerId.get(record.playerId);
            if (participant?.userId && optedOut.has(participant.userId)) {
                await excludeRecord(prisma, record.id);
                continue;
            }
            // 報告が無い、または同意していない。載せない（既定は非掲載）
            if (!participant || !participant.nameConsent) {
                continue;
            }
            const subjectKey = toSubjectKey({
                userId: participant.userId,
                playerId: record.playerId,
            });
            const awarded = await applyRecord({
                recordId: record.id,
                playId,
                playerId: record.playerId,
                gameId: record.gameId,
                endedAt: record.endedAt,
                subjectKey,
                userId: participant.userId,
                // WHY: 集計行と上位 N 件を押さえる順をそろえ、同時に反映したときの
                // デッドロックを避ける。DB の照合順序は環境で変わるので、積み直しと
                // 同じ比較で並べる
                values: [...record.values].sort((a, b) =>
                    compareKey(a.key, b.key),
                ),
            });
            if (!awarded) {
                continue;
            }
            reflected++;
            await notifyAwarded(awarded);
        } catch (err) {
            errors.push(err);
        }
    }
    if (errors.length > 0) {
        // WHY: 呼び出し側がやり直せるよう、反映できなかったことは伝える。
        // 反映済みの記録は reflectedAt で弾かれるので、やり直しても二重にならない
        throw new AggregateError(
            errors,
            `failed to reflect ${errors.length} score record(s) (playId = ${playId})`,
        );
    }
    return { reflected };
}

/**
 * プレイ自体の記録を、ゲーム全体の集計へ積む。
 *
 * WHY: 主体がいないので同意の判定は要らない。
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
    await prisma.$transaction(
        async (tx) => {
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
                const existing = await lockGameTotal(
                    tx,
                    record.gameId,
                    value.key,
                );
                await tx.scoreGameTotal.update({
                    where,
                    data: aggregateUpdate(existing, record.endedAt, value),
                });
            }
        },
        { timeout: REFLECT_TIMEOUT_MS },
    );
}

type LockedAggregate = {
    maxValue: number | null;
    maxAt: Date | null;
    minValue: number | null;
    minAt: Date | null;
    lastAt: Date | null;
};

/**
 * ゲーム全体の集計行を、無ければ作ったうえで押さえる。
 *
 * WHY: 最大・最小・最後の値は、読んだ値と比べてから書く。同じゲームの部屋が
 * 同時に終わると、押さえずに読んだ側が他方の結果を古い値で上書きしてしまう
 */
async function lockGameTotal(
    tx: TransactionClient,
    gameId: number,
    key: string,
): Promise<LockedAggregate> {
    await tx.$executeRaw`
        INSERT INTO "ScoreGameTotal" ("gameId", "key", "updatedAt")
        VALUES (${gameId}, ${key}, now())
        ON CONFLICT ("gameId", "key") DO NOTHING
    `;
    const rows = await tx.$queryRaw<LockedAggregate[]>`
        SELECT "maxValue", "maxAt", "minValue", "minAt", "lastAt" FROM "ScoreGameTotal"
        WHERE "gameId" = ${gameId} AND "key" = ${key}
        FOR UPDATE
    `;
    return rows[0];
}

/** 主体ごとの集計行を、無ければ作ったうえで押さえる。{@link lockGameTotal} と同じ理由 */
async function lockBest(
    tx: TransactionClient,
    gameId: number,
    key: string,
    subjectKey: SubjectKey,
): Promise<LockedAggregate> {
    await tx.$executeRaw`
        INSERT INTO "ScoreBest" ("gameId", "key", "subjectKey", "updatedAt")
        VALUES (${gameId}, ${key}, ${subjectKey}, now())
        ON CONFLICT ("gameId", "key", "subjectKey") DO NOTHING
    `;
    const rows = await tx.$queryRaw<LockedAggregate[]>`
        SELECT "maxValue", "maxAt", "minValue", "minAt", "lastAt" FROM "ScoreBest"
        WHERE "gameId" = ${gameId} AND "key" = ${key} AND "subjectKey" = ${subjectKey}
        FOR UPDATE
    `;
    return rows[0];
}

/** 押さえた集計行へ、1 件の値を積む更新 */
function aggregateUpdate(
    existing: LockedAggregate,
    endedAt: Date,
    value: {
        numValue: number | null;
        strValue: string | null;
        boolValue: boolean | null;
    },
) {
    const num = value.numValue;
    return {
        ...(isLatest(endedAt, existing.lastAt)
            ? {
                  lastAt: endedAt,
                  lastValue: num,
                  lastStr: value.strValue,
                  lastBool: value.boolValue,
              }
            : {}),
        recordCount: { increment: 1 },
        ...(value.boolValue === true ? { trueCount: { increment: 1 } } : {}),
        ...(num != null
            ? {
                  count: { increment: 1 },
                  sum: { increment: num },
                  ...(isExtremum(
                      num,
                      endedAt,
                      existing.maxValue,
                      existing.maxAt,
                      1,
                  )
                      ? { maxValue: num, maxAt: endedAt }
                      : {}),
                  ...(isExtremum(
                      num,
                      endedAt,
                      existing.minValue,
                      existing.minAt,
                      -1,
                  )
                      ? { minValue: num, minAt: endedAt }
                      : {}),
              }
            : {}),
    };
}

/**
 * 最大 (sign = 1)・最小 (sign = -1) として上書きしてよいか。
 *
 * WHY: 同じ値なら最初に達した日時を残す。{@link isLatest} と同じく反映は
 * プレイの終わった順と限らないので、同値でも日時が早ければ上書きする
 */
function isExtremum(
    num: number,
    endedAt: Date,
    value: number | null,
    at: Date | null,
    sign: 1 | -1,
): boolean {
    if (value == null) {
        return true;
    }
    if (num === value) {
        return at == null || endedAt < at;
    }
    return sign === 1 ? num > value : num < value;
}

/**
 * 最後の値として上書きしてよいか。
 *
 * WHY: 同意の報告は遅れて届きうるので、反映の順序はプレイの終わった順と限らない
 */
function isLatest(endedAt: Date, lastAt: Date | null | undefined): boolean {
    return lastAt == null || endedAt >= lastAt;
}

interface ApplyRecordParameterObject {
    recordId: number;
    playId: number;
    playerId: string;
    gameId: number;
    endedAt: Date;
    subjectKey: SubjectKey;
    userId: string | null;
    values: {
        key: string;
        numValue: number | null;
        strValue: string | null;
        boolValue: boolean | null;
    }[];
}

/**
 * 同意の控えを、行を押さえたうえで読む。
 *
 * WHY: 同意の報告も同じ行を押さえてから更新する。突き合わせの冒頭で読んだ
 * 同意のまま反映すると、その後に届いた撤回が効かない
 */
async function lockConsent(
    tx: TransactionClient,
    playId: number,
    playerId: string,
): Promise<{ nameConsent: boolean; guestName: string | null } | undefined> {
    const rows = await tx.$queryRaw<
        { nameConsent: boolean; guestName: string | null }[]
    >`
        SELECT "nameConsent", "guestName" FROM "PlayParticipant"
        WHERE "playId" = ${playId} AND "playerId" = ${playerId}
        FOR UPDATE
    `;
    return rows[0];
}

/**
 * 掲載をやめている間の記録を、以後も載せない印を付ける。
 *
 * WHY: 未反映のまま残すと、掲載を再開した後に届いた同意の報告で載ってしまう。
 * 再開はこれから遊ぶ分にだけ効かせる
 */
async function excludeRecord(
    client: TransactionClient | typeof prisma,
    recordId: number,
): Promise<void> {
    await client.scoreRecord.updateMany({
        where: { id: recordId, reflectedAt: null },
        data: { excluded: true },
    });
}

/** 掲載用へ反映したら、あわせて付与した称号を返す。反映しなかったら null */
async function applyRecord(
    param: ApplyRecordParameterObject,
): Promise<TitleAward[] | null> {
    return await prisma.$transaction(
        async (tx) => {
            const consent = await lockConsent(tx, param.playId, param.playerId);
            if (!consent?.nameConsent) {
                return null;
            }
            // WHY: 突き合わせの冒頭で見た判定は古いことがある。書き込む直前に確かめ直す
            if (param.userId && (await lockOptOut(tx, param.userId))) {
                await excludeRecord(tx, param.recordId);
                return null;
            }
            // WHY: 反映済みの印を先に立て、同じ条件で 1 件だけ動いたことを確かめる。
            // 同時に 2 回走っても、後から来たほうは 0 件になって加算しない
            // 掲載をやめていた間の記録と判定されたものも、ここで弾く
            const marked = await tx.scoreRecord.updateMany({
                where: {
                    id: param.recordId,
                    reflectedAt: null,
                    excluded: false,
                },
                data: { reflectedAt: new Date(), subjectKey: param.subjectKey },
            });
            if (marked.count === 0) {
                return null;
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
                    guestName: consent.guestName,
                },
                // 最後に確定した名前で上書きする
                update: { userId: param.userId, guestName: consent.guestName },
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
                    update: { count: { increment: 1 } },
                });
                // WHY: 同意の報告は遅れて届きうるので、反映の順序はプレイの終わった順と
                // 限らない。新しいときだけ進める
                await tx.scorePlayCount.updateMany({
                    where: {
                        gameId: param.gameId,
                        subjectKey: param.subjectKey,
                        lastPlayedAt: { lt: param.endedAt },
                    },
                    data: { lastPlayedAt: param.endedAt },
                });
            }
            for (const value of param.values) {
                await applyValue(tx, param, value);
            }
            // WHY: 反映と同じトランザクションで評価する。反映だけ確定して評価が
            // 失敗すると、反映済みの記録は二度と評価されない
            //
            // WHY: サインイン利用者だけが対象で、ゲストは identity が続かないため付けない
            return param.userId
                ? await evaluateTitles(tx, param.userId, param.gameId)
                : [];
        },
        { timeout: REFLECT_TIMEOUT_MS },
    );
}

async function applyValue(
    tx: TransactionClient,
    param: ApplyRecordParameterObject,
    value: ApplyRecordParameterObject["values"][number],
): Promise<void> {
    const where = {
        gameId_key_subjectKey: {
            gameId: param.gameId,
            key: value.key,
            subjectKey: param.subjectKey,
        },
    };
    const existing = await lockBest(
        tx,
        param.gameId,
        value.key,
        param.subjectKey,
    );
    if (value.numValue != null) {
        await keepTopEntries(tx, param, value.key, value.numValue);
    }
    await tx.scoreBest.update({
        where,
        data: aggregateUpdate(existing, param.endedAt, value),
    });
}

/**
 * あるキーの上位 N 件を押さえる。
 *
 * WHY: 上位 N 件は行が入れ替わるので、行ではなくキーごとの鍵で押さえる。
 * 反映と積み直しが同時に走ると、積み直しが反映した分を消したり、反映が古い
 * 向きで末尾を捨てたりする
 */
async function lockTopEntries(
    tx: TransactionClient,
    gameId: number,
    key: string,
): Promise<void> {
    await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${gameId}::int4, hashtext(${key}))
    `;
}

/**
 * 歴代ランキングの上位 N 件を保つ。
 *
 * WHY: 差し込んで末尾を捨てるだけでよい。こぼれた記録が上位へ戻ることはないので、
 * 元の記録を消した後もランキングは保たれる。
 *
 * WHY: いまの設定の向きで 1 本だけ持つ。設定が変わったら積み直す（`rebuildTopEntries`）。
 */
async function keepTopEntries(
    tx: TransactionClient,
    param: ApplyRecordParameterObject,
    key: string,
    value: number,
): Promise<void> {
    await lockTopEntries(tx, param.gameId, key);
    // WHY: 突き合わせの冒頭で読んだ設定は、積み直しの前のものかもしれない。
    // 古い向きで末尾を捨てると、積み直した上位を消してしまう
    const setting = fieldSetting(await fetchFormat(param.gameId, tx), key);
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
    await trimTopEntries(tx, param.gameId, key, setting.direction);
}

/** 上位 N 件からこぼれた末尾を捨てる */
async function trimTopEntries(
    tx: TransactionClient,
    gameId: number,
    key: string,
    direction: ScoreDirection,
): Promise<void> {
    // 同値のときは先に達成したほうを上位に置く
    const overflow = await tx.scoreTopEntry.findMany({
        where: { gameId, key },
        orderBy: [
            { value: direction === "high" ? "desc" : "asc" },
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
 *
 * WHY: 上位 N 件の積み直しを伴うので、呼び出し側のトランザクションには
 * {@link TOP_ENTRY_REBUILD_TIMEOUT_MS} を指定する。
 *
 * WHY: 名前を外すことと集計の後始末を 1 つのトランザクションで行う。反映と
 * 同じ行を押さえて直列化しているので、分けて先に確定させることはしない
 */
export async function revokeSubject(
    subjectKey: SubjectKey,
    tx?: TransactionClient,
): Promise<void> {
    if (!tx) {
        await prisma.$transaction((tx) => revokeSubject(subjectKey, tx), {
            timeout: TOP_ENTRY_REBUILD_TIMEOUT_MS,
        });
        return;
    }
    // WHY: 今ある上位 N 件だけでなく、その主体の値が載りうるキーをすべて押さえる。
    // 設定変更の積み直しが確定前だと、まだ載っていないキーへこの主体を差し込み、
    // 取りやめた後の上位に残してしまう
    const candidates = [
        ...(await tx.scoreValue.findMany({
            where: { subjectKey, numValue: { not: null } },
            distinct: ["gameId", "key"],
            select: { gameId: true, key: true },
        })),
        ...(await findTopKeys(tx, subjectKey)),
    ];
    const lockKeys = [
        ...new Map(candidates.map((k) => [`${k.gameId}:${k.key}`, k])).values(),
    ].sort(compareGameKey);
    // WHY: 反映と同じ順で押さえ、同時に走ったときのデッドロックを避ける
    for (const { gameId, key } of lockKeys) {
        await lockTopEntries(tx, gameId, key);
    }
    // WHY: 押さえた後に読み直す。押さえる前に確定した積み直しの結果も拾う
    const topKeys = (await findTopKeys(tx, subjectKey)).sort(compareGameKey);
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
    for (const { gameId, key } of topKeys) {
        await refillTopEntries(tx, gameId, key);
    }
}

async function findTopKeys(
    tx: TransactionClient,
    subjectKey: SubjectKey,
): Promise<{ gameId: number; key: string }[]> {
    return await tx.scoreTopEntry.findMany({
        where: { subjectKey },
        distinct: ["gameId", "key"],
        select: { gameId: true, key: true },
    });
}

function compareGameKey(
    a: { gameId: number; key: string },
    b: { gameId: number; key: string },
): number {
    return a.gameId - b.gameId || compareKey(a.key, b.key);
}

/**
 * 上位 N 件の空いた枠を、残っている生レコードで埋める。
 *
 * WHY: 1 人が上位の大半を占めていたキーでは、その人の分を落とすと表示件数を
 * 割り込む。こぼれた記録は二度と上位へ戻らないので、生レコードから拾い直す。
 *
 * WHY: 丸ごと積み直さず、今ある行は残して足すだけにする。積み直すと、生レコードの
 * 保持期間を過ぎた上位記録まで失う
 */
async function refillTopEntries(
    tx: TransactionClient,
    gameId: number,
    key: string,
): Promise<void> {
    const setting = fieldSetting(await fetchFormat(gameId, tx), key);
    if (setting.dedupe !== "all") {
        return;
    }
    const existing = await tx.scoreTopEntry.findMany({
        where: { gameId, key, recordId: { not: null } },
        select: { recordId: true },
    });
    const values = await tx.scoreValue.findMany({
        where: {
            gameId,
            key,
            subjectKey: { not: null },
            numValue: { not: null },
            recordId: { notIn: existing.map((row) => row.recordId!) },
        },
        // 同値のときは先に達成したほうを上位に置く
        orderBy: [
            { numValue: setting.direction === "high" ? "desc" : "asc" },
            { endedAt: "asc" },
        ],
        take: TOP_ENTRY_LIMIT,
        select: {
            recordId: true,
            subjectKey: true,
            numValue: true,
            endedAt: true,
        },
    });
    if (values.length === 0) {
        return;
    }
    await tx.scoreTopEntry.createMany({
        data: values.map((value) => ({
            gameId,
            key,
            value: value.numValue!,
            subjectKey: value.subjectKey!,
            recordId: value.recordId,
            endedAt: value.endedAt,
        })),
    });
    await trimTopEntries(tx, gameId, key, setting.direction);
}

/**
 * 歴代ランキングの上位 N 件を、残っている生レコードから積み直す。
 *
 * 投稿者が上位の決め方か複数ランクインの設定を変えたときに呼ぶ。
 * **生レコードが残っている分しか戻らない。** 向きごとに上位 N 件を持ち分けない
 * 代わりに、それより前の上位記録は失われる、という制約を受け入れている。
 *
 * WHY: 主体ごとの歴代（ScoreBest）には触らない。向きや代表値に関わらず
 * 必要な値をすべて積んでいるので、作り直すと生レコードより前の歴代を失うだけになる
 *
 * WHY: 複数ランクインをやめたキーの上位 N 件も消す。使われなくなった行を残さない
 *
 * WHY: 設定の保存と同じトランザクションで呼ぶ。積み直しだけ失敗すると、保存
 * し直しても設定に差分が無く、積み直されないまま残る
 */
export async function rebuildTopEntries(
    tx: TransactionClient,
    gameId: number,
    keys: string[],
): Promise<void> {
    // WHY: 反映と同じ順で押さえ、同時に走ったときのデッドロックを避ける
    for (const key of [...keys].sort(compareKey)) {
        // WHY: 読んでから消すまでの間に反映された上位を失わないよう、反映と
        // 同じ鍵を押さえてから読む
        await lockTopEntries(tx, gameId, key);
        const setting = fieldSetting(await fetchFormat(gameId, tx), key);
        const values =
            setting.dedupe === "all"
                ? await tx.scoreValue.findMany({
                      where: {
                          gameId,
                          key,
                          subjectKey: { not: null },
                          numValue: { not: null },
                      },
                      // 同値のときは先に達成したほうを上位に置く
                      orderBy: [
                          {
                              numValue:
                                  setting.direction === "high" ? "desc" : "asc",
                          },
                          { endedAt: "asc" },
                      ],
                      take: TOP_ENTRY_LIMIT,
                      select: {
                          recordId: true,
                          subjectKey: true,
                          numValue: true,
                          endedAt: true,
                      },
                  })
                : [];
        await tx.scoreTopEntry.deleteMany({ where: { gameId, key } });
        if (values.length > 0) {
            await tx.scoreTopEntry.createMany({
                data: values.map((value) => ({
                    gameId,
                    key,
                    value: value.numValue!,
                    subjectKey: value.subjectKey!,
                    recordId: value.recordId,
                    endedAt: value.endedAt,
                })),
            });
        }
    }
}

function compareKey(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
