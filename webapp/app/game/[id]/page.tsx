"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { Alert, Container, Skeleton } from "@mui/material";
import { GameDetail } from "@/components/game-detail";
import { useAuth } from "@/lib/client/useAuth";
import { useFeedback } from "@/lib/client/useFeedback";
import { useGame } from "@/lib/client/useGame";

export default function GameDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [user] = useAuth();
    const {
        isLoading: isGameLoading,
        gameInfo,
        error: gameError,
    } = useGame(id);
    const {
        isLoading: isFeedbackLoading,
        list: feedbackList,
        error: feedbackError,
        mutate: refreshFeedback,
    } = useFeedback(id);

    const isPublisher = useMemo(() => {
        if (!user || user.authType !== "oauth" || !gameInfo) {
            return false;
        }
        return user.id === gameInfo.publisher.id;
    }, [user, gameInfo]);

    if (isGameLoading || isFeedbackLoading) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Skeleton variant="rectangular" height={240} />
            </Container>
        );
    }

    if (gameError || feedbackError || !gameInfo) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Alert severity="error" variant="outlined">
                    {gameError ?? feedbackError ?? "読み込みに失敗しました。"}
                </Alert>
            </Container>
        );
    }

    return (
        <GameDetail
            gameInfo={gameInfo}
            feedbackList={feedbackList ?? []}
            isPublisher={isPublisher}
            user={user}
            onRefresh={refreshFeedback}
        />
    );
}
