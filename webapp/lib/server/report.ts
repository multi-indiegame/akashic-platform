import { prisma, ReportTargetType } from "@multi-indiegame/persist-schema";
import { GUEST_NAME } from "../types";
import { authorizePlayChat } from "./play-chat";
import {
    decodeSubjectToken,
    subjectDisplayName,
    viewerSubjectKey,
} from "./score-subject";

const GLOBAL_WINDOW_SECONDS = parseInt(
    process.env.REPORT_RATE_GLOBAL_WINDOW_SECONDS ?? "60",
);
const GLOBAL_MAX = parseInt(process.env.REPORT_RATE_GLOBAL_MAX ?? "60");
const SHORT_WINDOW_SECONDS = parseInt(
    process.env.REPORT_RATE_SHORT_WINDOW_SECONDS ?? "60",
);
const SHORT_MAX = parseInt(process.env.REPORT_RATE_SHORT_MAX ?? "5");
const MEDIUM_WINDOW_SECONDS = parseInt(
    process.env.REPORT_RATE_MEDIUM_WINDOW_SECONDS ?? "3600",
);
const MEDIUM_MAX = parseInt(process.env.REPORT_RATE_MEDIUM_MAX ?? "30");

const SNAPSHOT_MAX = 500;

export type ReportRateResult =
    { ok: true } | { ok: false; retryAfterSeconds: number };

type ReporterKeys = { reporterId?: string; reporterGuestId?: string };

async function checkWindow(
    where: ReporterKeys,
    windowSeconds: number,
    max: number,
) {
    const now = Date.now();
    const recent = await prisma.report.findMany({
        where: {
            ...where,
            createdAt: { gte: new Date(now - windowSeconds * 1000) },
        },
        orderBy: { createdAt: "desc" },
        take: max,
        select: { createdAt: true },
    });
    if (recent.length < max) {
        return undefined;
    }
    const oldest = recent[recent.length - 1];
    return Math.max(
        1,
        Math.ceil(
            (oldest.createdAt.getTime() + windowSeconds * 1000 - now) / 1000,
        ),
    );
}

export async function checkReportRateLimit(
    keys: ReporterKeys,
): Promise<ReportRateResult> {
    const checks: Promise<number | undefined>[] = [
        checkWindow({}, GLOBAL_WINDOW_SECONDS, GLOBAL_MAX),
    ];
    // 通報者を特定できる場合のみ通報者単位でも絞る
    if (keys.reporterId || keys.reporterGuestId) {
        checks.push(
            checkWindow(keys, SHORT_WINDOW_SECONDS, SHORT_MAX),
            checkWindow(keys, MEDIUM_WINDOW_SECONDS, MEDIUM_MAX),
        );
    }
    const results = await Promise.all(checks);
    const retryAfterSeconds = results.reduce<number | undefined>(
        (acc, cur) =>
            cur == null ? acc : acc == null ? cur : Math.max(acc, cur),
        undefined,
    );
    if (retryAfterSeconds != null) {
        return { ok: false, retryAfterSeconds };
    }
    return { ok: true };
}

function truncate(text: string) {
    const normalized = text.trim().replace(/\s+/g, " ");
    return normalized.length > SNAPSHOT_MAX
        ? `${normalized.slice(0, SNAPSHOT_MAX)}…`
        : normalized;
}

export interface ResolvedTarget {
    targetType: ReportTargetType;
    targetId: string;
    bodySnapshot: string;
    /** 通報者自身が対象のとき true（自分の投稿は通報させない） */
    isSelf: boolean;
}

/**
 * 通報対象を DB から引き、証拠保全用の bodySnapshot を組み立てる。
 * 対象が存在しなければ null。種別ごとに id の型が異なるため文字列化する。
 */
export async function resolveReportTarget(
    input:
        | { kind: "message"; source: "board" | "chat"; messageId: number }
        | { kind: "play"; playId: number }
        | { kind: "user"; userId: string }
        | { kind: "scoreSubject"; gameId: number; subject: string },
    reporter: { userId?: string; guestId?: string },
): Promise<ResolvedTarget | null> {
    if (input.kind === "scoreSubject") {
        return await resolveScoreSubject(input.gameId, input.subject, reporter);
    }
    if (input.kind === "message") {
        if (input.source === "board") {
            const m = await prisma.boardMessage.findUnique({
                where: { id: input.messageId },
                select: {
                    id: true,
                    authorId: true,
                    authorName: true,
                    guestId: true,
                    body: true,
                },
            });
            if (!m) return null;
            return {
                targetType: ReportTargetType.BOARD_MESSAGE,
                targetId: `${m.id}`,
                bodySnapshot: `伝言板 / ${m.authorName}: ${truncate(m.body)}`,
                isSelf: isSameAuthor(m, reporter),
            };
        }
        const m = await prisma.playChatMessage.findUnique({
            where: { id: input.messageId },
            select: {
                id: true,
                playId: true,
                authorId: true,
                authorName: true,
                guestId: true,
                body: true,
            },
        });
        if (!m) return null;
        // 入室権を持たない相手が連番 messageId を推測して通報すると、非公開
        // メッセージの本文が bodySnapshot に控えられ管理者メールにも載る。
        // ミュートと同じく、通報を受理する前に部屋の閲覧権を確認する
        if (!(await authorizePlayChat(m.playId)).ok) {
            return null;
        }
        return {
            targetType: ReportTargetType.PLAY_CHAT_MESSAGE,
            targetId: `${m.id}`,
            bodySnapshot: `部屋チャット(playId=${m.playId}) / ${m.authorName}: ${truncate(m.body)}`,
            isSelf: isSameAuthor(m, reporter),
        };
    }
    if (input.kind === "play") {
        const play = await prisma.play.findUnique({
            where: { id: input.playId },
            select: {
                id: true,
                name: true,
                gameMasterId: true,
                gmUserId: true,
                content: { select: { game: { select: { title: true } } } },
            },
        });
        if (!play) return null;
        const isSelf = play.gmUserId
            ? play.gmUserId === reporter.userId
            : play.gameMasterId === reporter.guestId;
        return {
            targetType: ReportTargetType.PLAY,
            targetId: `${play.id}`,
            bodySnapshot: `部屋「${truncate(play.name)}」/ ゲーム「${play.content.game.title}」`,
            isSelf,
        };
    }
    const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, name: true, handle: true },
    });
    if (!user) return null;
    return {
        targetType: ReportTargetType.USER,
        targetId: user.id,
        bodySnapshot: `ユーザー: ${user.name ?? GUEST_NAME}${user.handle ? ` (@${user.handle})` : ""}`,
        isSelf: user.id === reporter.userId,
    };
}

/**
 * WHY: 統計の表示名は、サインイン利用者なら User.name、ゲストなら参加時に
 * 自称した名前で、どちらも後から変わりうる。通報時点でどのゲームのランキングに
 * どの名前で載っていたかを控えておく。
 */
async function resolveScoreSubject(
    gameId: number,
    subject: string,
    reporter: { userId?: string; guestId?: string },
): Promise<ResolvedTarget | null> {
    const subjectKey = decodeSubjectToken(subject);
    if (!subjectKey) return null;
    const [name, game, best, playCount] = await Promise.all([
        subjectDisplayName(subjectKey),
        prisma.game.findUnique({
            where: { id: gameId },
            select: { title: true },
        }),
        // WHY: トークンはゲームに結び付いていない。別のゲームで得たトークンを
        // 渡されると、載っていないゲームのランキングに載っていたと控えてしまう
        prisma.scoreBest.findFirst({
            where: { gameId, subjectKey },
            select: { id: true },
        }),
        prisma.scorePlayCount.findUnique({
            where: { gameId_subjectKey: { gameId, subjectKey } },
            select: { id: true },
        }),
    ]);
    if (!name || !game || (!best && !playCount)) return null;
    const self = reporter.userId
        ? viewerSubjectKey({ authType: "oauth", id: reporter.userId })
        : reporter.guestId
          ? viewerSubjectKey({ authType: "guest", id: reporter.guestId })
          : undefined;
    return {
        targetType: ReportTargetType.SCORE_SUBJECT,
        targetId: subjectKey,
        bodySnapshot: `統計(gameId=${gameId}) / ゲーム「${game.title}」/ 表示名: ${truncate(name)}`,
        isSelf: subjectKey === self,
    };
}

function isSameAuthor(
    message: { authorId: string | null; guestId: string | null },
    reporter: { userId?: string; guestId?: string },
) {
    if (message.authorId && reporter.userId) {
        return message.authorId === reporter.userId;
    }
    if (message.guestId && reporter.guestId) {
        return message.guestId === reporter.guestId;
    }
    return false;
}
