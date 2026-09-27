"use server";

import { STATS_MODERATION_TOKEN_MAX, StatsSubjectModeration } from "../types";
import { anonKey } from "./anon-key";
import { getAuth } from "./auth";
import { getMuteSet } from "./mute";
import {
    decodeSubjectToken,
    filterListedSubjects,
    guestSubjectKey,
    resolveSubjectTargets,
    viewerSubjectKey,
} from "./score-subject";

/**
 * 統計に載った主体ごとの、閲覧者から見たミュート状態を返す。
 *
 * WHY: 統計 API は閲覧者を問わずキャッシュしているので、閲覧者ごとに変わる
 * ミュート判定や匿名キーは載せられない。表示中の主体に絞って別に問い合わせる。
 *
 * 1 回に受け付けるのは {@link STATS_MODERATION_TOKEN_MAX} 件まで。超える分は
 * 呼び出し側で分けて問い合わせる。
 */
export async function fetchStatsModerationAction(
    tokens: unknown,
): Promise<Record<string, StatsSubjectModeration>> {
    if (!Array.isArray(tokens)) {
        return {};
    }
    const viewer = await getAuth();
    if (!viewer) {
        return {};
    }
    const keyByToken = new Map<string, string>();
    for (const token of new Set(tokens)) {
        if (keyByToken.size >= STATS_MODERATION_TOKEN_MAX) {
            break;
        }
        if (typeof token !== "string") {
            continue;
        }
        const subjectKey = decodeSubjectToken(token);
        if (subjectKey) {
            keyByToken.set(token, subjectKey);
        }
    }
    // WHY: 取りやめる前に控えたトークンで匿名キーなどを引けないよう、掲載を
    // 取りやめた主体は結果に含めない
    const listed = await filterListedSubjects([...keyByToken.values()]);
    for (const [token, subjectKey] of keyByToken) {
        if (!listed.has(subjectKey)) {
            keyByToken.delete(token);
        }
    }
    const [targets, mutes] = await Promise.all([
        resolveSubjectTargets([...keyByToken.values()]),
        getMuteSet(viewer),
    ]);
    const mutedGuests = new Set([...mutes.guestIds].map(guestSubjectKey));
    const self = viewerSubjectKey(viewer);
    const result: Record<string, StatsSubjectModeration> = {};
    for (const [token, subjectKey] of keyByToken) {
        const target = targets.get(subjectKey);
        result[token] = {
            anonKey: target ? anonKey(target, viewer.id) : undefined,
            muted: subjectKey.startsWith("u:")
                ? mutes.userIds.has(subjectKey.slice(2))
                : mutedGuests.has(subjectKey),
            isSelf: subjectKey === self,
        };
    }
    return result;
}
