"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import useSWR from "swr";
import { GameStats, ScoreEntry, StatsSubjectModeration } from "../types";
import { fetchStatsModerationAction } from "../server/score-moderation-action";
import {
    muteScoreSubjectAction,
    unmuteScoreSubjectAction,
} from "../server/mute-action";
import { useAuth } from "./useAuth";
import { useLocalMutes } from "./useLocalMutes";
import {
    getMuteOverride,
    setMuteOverride,
    useMuteOverrideVersion,
} from "./mute-store";

const initialState = { ok: true, submitted: false } as const;

function collectTokens(stats: GameStats | undefined) {
    if (!stats) {
        return [];
    }
    const tokens = new Set<string>();
    for (const entry of [
        ...stats.playRanking,
        ...stats.sections.flatMap((section) => section.entries),
    ]) {
        if (entry.subject) {
            tokens.add(entry.subject);
        }
    }
    return [...tokens].sort();
}

/**
 * WHY: 匿名キーを引けない相手（参加の記録が消えたゲスト）でも、サインイン利用者の
 * ミュートは付いていることがある。解除を画面に反映できるよう、主体のトークンで
 * 代わりに上書きを持つ。
 */
function overrideKey(subject: string, state: StatsSubjectModeration) {
    return state.anonKey ?? `subject:${subject}`;
}

/**
 * 統計のランキングに載った相手のミュート。useMute と同じく、サインイン利用者は
 * サーバーに、未サインイン利用者は端末内に保存し、部屋チャットのミュートとも
 * 同じ相手として扱う。
 */
export function useStatsModeration(
    gameId: number,
    title: string,
    stats: GameStats | undefined,
) {
    const [user] = useAuth();
    const localMutes = useLocalMutes();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | undefined>();
    useMuteOverrideVersion();

    const isPersisted = user?.authType === "oauth";
    const tokens = useMemo(() => collectTokens(stats), [stats]);
    const { data } = useSWR(
        tokens.length > 0
            ? ["stats-moderation", user?.authType, user?.id, ...tokens]
            : null,
        () => fetchStatsModerationAction(tokens),
    );

    const stateOf = useCallback(
        (entry: ScoreEntry) =>
            entry.subject ? data?.[entry.subject] : undefined,
        [data],
    );

    const isMuted = useCallback(
        (entry: ScoreEntry) => {
            const state = stateOf(entry);
            if (!entry.subject || !state) {
                return false;
            }
            const override = getMuteOverride(overrideKey(entry.subject, state));
            if (override != null) {
                return override;
            }
            return isPersisted
                ? state.muted
                : localMutes.isMuted(state.anonKey);
        },
        [isPersisted, localMutes, stateOf],
    );

    /** 自分自身と、まだ状態を引けていない相手には操作を出さない */
    const canReport = useCallback(
        (entry: ScoreEntry) => {
            const state = stateOf(entry);
            return !!state && !state.isSelf;
        },
        [stateOf],
    );

    const canMute = useCallback(
        (entry: ScoreEntry) => {
            const state = stateOf(entry);
            if (!state || state.isSelf) {
                return false;
            }
            return !!state.anonKey || (isPersisted && isMuted(entry));
        },
        [isMuted, isPersisted, stateOf],
    );

    const toggle = useCallback(
        (entry: ScoreEntry) => {
            setError(undefined);
            const state = stateOf(entry);
            if (!entry.subject || !state) {
                setError("この相手はミュートできません。");
                return;
            }
            const subject = entry.subject;
            const key = overrideKey(subject, state);
            const muted = isMuted(entry);

            if (!isPersisted) {
                const anonKey = state.anonKey;
                if (!anonKey) {
                    setError("この相手はミュートできません。");
                    return;
                }
                if (muted) {
                    localMutes.remove(anonKey);
                } else if (
                    !localMutes.add(
                        anonKey,
                        `${entry.name}: 「${title}」の統計`,
                    )
                ) {
                    setError("ミュートの上限に達しました。");
                    return;
                }
                setMuteOverride(key, !muted);
                return;
            }

            const formData = new FormData();
            formData.set("gameId", `${gameId}`);
            formData.set("subject", subject);
            startTransition(async () => {
                const next = await (muted
                    ? unmuteScoreSubjectAction(initialState, formData)
                    : muteScoreSubjectAction(initialState, formData));
                if (!next.ok) {
                    setError(next.message);
                    return;
                }
                setMuteOverride(key, !muted);
            });
        },
        [gameId, isMuted, isPersisted, localMutes, stateOf, title],
    );

    return {
        gameId,
        isMuted,
        canMute,
        canReport,
        toggle,
        pending,
        error,
        clearError: () => setError(undefined),
        /** 未サインイン時はサインインを促す文言を出し分ける */
        isPersisted,
    } as const;
}

export type StatsModeration = ReturnType<typeof useStatsModeration>;
