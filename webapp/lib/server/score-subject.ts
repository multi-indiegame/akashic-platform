import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
} from "node:crypto";
import { prisma } from "@multi-indiegame/persist-schema";
import { User } from "../types";
import { gamePlayerId } from "./game-player-id";
import { parseSessionViewerId } from "./viewer-identity";

/**
 * 統計の主体（subjectKey）を公開ページで指すためのトークン。
 *
 * WHY: ゲストの subjectKey は `g:<in-game playerId>` で、playerId は部屋の参加者に
 * しか配られない。公開ページにそのまま載せると、部屋の外の誰でも playerId を知り
 * ゲーム内の同一人物と突き合わせられてしまう。一方ミュート・通報では相手を
 * 特定し直す必要があるため、ハッシュではなく復号できる形にする。
 *
 * WHY: 統計 API は閲覧者を問わずキャッシュするので、閲覧者ごとに変わる匿名キー
 * は使えない。同じ主体は常に同じ値になるよう IV を平文から決める（SIV と同じ考え
 * 方で、漏れるのは「同じ主体かどうか」だけ）。画面上で同一人物の行をまとめて
 * ミュートするのにもこの性質を使う。
 */
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getSecret() {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AUTH_SECRET is required.");
    }
    return secret;
}

// next-auth の JWT や他の Cookie と鍵素材を共有しないようラベルで分離する
function encryptionKey() {
    return createHash("sha256").update(`score-subject:${getSecret()}`).digest();
}

export function encodeSubjectToken(subjectKey: string): string {
    const key = encryptionKey();
    const iv = createHmac("sha256", key)
        .update(subjectKey)
        .digest()
        .subarray(0, IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([
        cipher.update(subjectKey, "utf8"),
        cipher.final(),
    ]);
    return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}

export function decodeSubjectToken(token: string): string | null {
    try {
        const raw = Buffer.from(token, "base64url");
        if (raw.length <= IV_LENGTH + TAG_LENGTH) {
            return null;
        }
        const decipher = createDecipheriv(
            "aes-256-gcm",
            encryptionKey(),
            raw.subarray(0, IV_LENGTH),
        );
        decipher.setAuthTag(raw.subarray(raw.length - TAG_LENGTH));
        const subjectKey = Buffer.concat([
            decipher.update(raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH)),
            decipher.final(),
        ]).toString("utf8");
        return /^[ug]:/.test(subjectKey) ? subjectKey : null;
    } catch {
        return null;
    }
}

/** 閲覧者自身の subjectKey */
export function viewerSubjectKey(viewer: Pick<User, "authType" | "id">) {
    return viewer.authType === "oauth"
        ? `u:${viewer.id}`
        : guestSubjectKey(viewer.id);
}

/**
 * guest_id から subjectKey を組む。部屋チャットでミュートしたゲストは guest_id で
 * 控えているので、統計の主体と突き合わせるときに同じ派生をかける。
 */
export function guestSubjectKey(guestId: string) {
    return `g:${gamePlayerId({ authType: "guest", id: guestId })}`;
}

/** ミュート・匿名キーの対象。投稿者と同じ形で持つ */
export interface SubjectTarget {
    authorId?: string;
    guestId?: string;
}

/**
 * subjectKey を、ミュート・匿名キーが扱う相手（userId か guest_id）へ戻す。
 *
 * WHY: ゲストの playerId は guest_id の非可逆な派生値なので逆算できない。参加の
 * 記録（PlayParticipant）に残っている対応から引く。部屋ごと消えて対応が残って
 * いない相手は特定できないので、呼び出し側で対象外として扱う。
 */
export async function resolveSubjectTargets(
    subjectKeys: string[],
): Promise<Map<string, SubjectTarget>> {
    const targets = new Map<string, SubjectTarget>();
    const playerIds: string[] = [];
    for (const subjectKey of subjectKeys) {
        if (subjectKey.startsWith("u:")) {
            targets.set(subjectKey, { authorId: subjectKey.slice(2) });
        } else if (subjectKey.startsWith("g:")) {
            playerIds.push(subjectKey.slice(2));
        }
    }
    if (playerIds.length === 0) {
        return targets;
    }
    const participants = await prisma.playParticipant.findMany({
        where: { playerId: { in: playerIds }, userId: null },
        distinct: ["playerId"],
        select: { playerId: true, viewerId: true },
    });
    for (const participant of participants) {
        const viewer = parseSessionViewerId(participant.viewerId);
        if (viewer?.authType === "guest") {
            targets.set(`g:${participant.playerId}`, { guestId: viewer.id });
        }
    }
    return targets;
}

/** 掲載中の主体に絞る。掲載を取りやめた主体は ScoreSubject ごと消えている */
export async function filterListedSubjects(
    subjectKeys: string[],
): Promise<Set<string>> {
    if (subjectKeys.length === 0) {
        return new Set();
    }
    const subjects = await prisma.scoreSubject.findMany({
        where: { subjectKey: { in: subjectKeys } },
        select: { subjectKey: true },
    });
    return new Set(subjects.map((subject) => subject.subjectKey));
}

/**
 * 統計に出している表示名。resolveNames と同じ引き方をする。
 *
 * WHY: 掲載を取りやめた主体は null を返し、ミュート・通報の対象にさせない。
 * トークンは主体ごとに固定なので、取りやめる前に控えたトークンでも届いてしまう。
 */
export async function subjectDisplayName(
    subjectKey: string,
): Promise<string | null> {
    const subject = await prisma.scoreSubject.findUnique({
        where: { subjectKey },
        select: { userId: true, guestName: true },
    });
    if (!subject) {
        return null;
    }
    if (subject.userId) {
        const user = await prisma.user.findUnique({
            where: { id: subject.userId },
            select: { name: true },
        });
        return user?.name ?? "退会したユーザー";
    }
    return subject.guestName ?? "退会したユーザー";
}
