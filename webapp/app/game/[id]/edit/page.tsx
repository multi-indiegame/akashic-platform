"use client";

import { useParams } from "next/navigation";
import { Alert, Container, Skeleton } from "@mui/material";
import { GameForm } from "@/components/game-form";
import { SignInAlert } from "@/components/sign-in-alert";
import { useAuth } from "@/lib/client/useAuth";
import { useGame } from "@/lib/client/useGame";

export default function GameEdit() {
    const { id } = useParams<{ id: string }>();
    const [user] = useAuth();
    const { isLoading, gameInfo, error } = useGame(id);

    if (isLoading) {
        return (
            <Container>
                <Skeleton variant="rectangular" />
            </Container>
        );
    }
    if (error || !id) {
        return (
            <Container maxWidth="md" sx={{ mt: 2 }}>
                <Alert variant="outlined" severity="error">
                    {error ??
                        "予期しないエラーが発生しました。画面を更新してください。"}
                </Alert>
            </Container>
        );
    }
    if (!user || user.authType === "guest") {
        const message = `投稿したゲームを編集するにはサインインが必要です。`;
        return <SignInAlert message={message} />;
    }
    if (user.id !== gameInfo?.publisher.id) {
        return (
            <Container maxWidth="md" sx={{ mt: 2 }}>
                <Alert variant="outlined" severity="error">
                    このゲームを編集する権限がありません。
                </Alert>
            </Container>
        );
    }
    return (
        <GameForm
            gameId={gameInfo.id}
            contentId={gameInfo.contentId}
            title={gameInfo.title}
            iconUrl={gameInfo.iconURL}
            description={gameInfo.description}
            credit={gameInfo.credit}
            streaming={gameInfo.streaming}
            externalLaunch={gameInfo.externalLaunch}
            externals={gameInfo.externals}
        />
    );
}
