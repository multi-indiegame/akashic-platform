"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Container, Skeleton, Snackbar, Stack } from "@mui/material";
import { StatsPeriod } from "@/lib/types";
import { useAuth } from "@/lib/client/useAuth";
import { useGame } from "@/lib/client/useGame";
import { useGameStats } from "@/lib/client/useGameStats";
import { GameStatsView } from "@/components/game-stats";
import { GameStatsHeader } from "@/components/game-stats-header";
import {
    ShareResult,
    postGameStatsToX,
    shareGameStats,
} from "@/lib/client/share-stats";

export function GameStatsPageView() {
    const { id } = useParams<{ id: string }>();
    const [period, setPeriod] = useState<StatsPeriod>("all");
    const [month, setMonth] = useState<string>();
    const [notice, setNotice] = useState<ShareResult | null>(null);
    const [user] = useAuth();
    const {
        isLoading: isGameLoading,
        gameInfo,
        error: gameError,
    } = useGame(id);
    const { isLoading, stats, error } = useGameStats(id, period, month);

    if (isGameLoading || isLoading) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Skeleton variant="rectangular" height={240} />
            </Container>
        );
    }
    if (gameError || !gameInfo) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Alert variant="outlined" severity="error">
                    {gameError ?? "ゲームが見つかりませんでした。"}
                </Alert>
            </Container>
        );
    }
    return (
        <Container maxWidth="lg" sx={{ py: 2 }}>
            <Stack spacing={2}>
                <GameStatsHeader
                    game={gameInfo}
                    canEdit={
                        user?.authType === "oauth" &&
                        user.id === gameInfo.publisher.id
                    }
                    onShare={async () =>
                        setNotice(
                            await shareGameStats({
                                gameId: gameInfo.id,
                                title: gameInfo.title,
                            }),
                        )
                    }
                    onPostToX={() =>
                        postGameStatsToX({
                            gameId: gameInfo.id,
                            title: gameInfo.title,
                        })
                    }
                />
                {error ? (
                    <Alert variant="outlined" severity="error">
                        {error}
                    </Alert>
                ) : (
                    stats && (
                        <GameStatsView
                            title={gameInfo.title}
                            stats={stats}
                            period={period}
                            month={month}
                            onPeriodChange={(next) => {
                                setPeriod(next);
                                if (next === "month" && !month) {
                                    setMonth(stats.months[0]);
                                }
                            }}
                            onMonthChange={setMonth}
                        />
                    )
                )}
            </Stack>
            <Snackbar
                open={!!notice}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
            >
                <Alert
                    variant="filled"
                    severity={notice?.severity ?? "success"}
                    onClose={() => setNotice(null)}
                >
                    {notice?.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}
