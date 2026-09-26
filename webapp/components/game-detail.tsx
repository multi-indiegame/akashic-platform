"use client";

import { useState } from "react";
import Link from "next/link";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Container,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { Leaderboard, Add, Settings, Article } from "@mui/icons-material";
import { FeedbackPost, GameInfo, User } from "@/lib/types";
import { verticalButtonSx } from "@/lib/client/theme";
import { FeedbackPanel } from "./feedback-panel";
import { GameStatsSummary } from "./game-stats-summary";
import { CreditPanel } from "./credit-panel";
import { UserInline } from "./user-inline";
import { renderTextWithLinks } from "./text-with-links";
import { PlayCreateDialog } from "./play-create-dialog";
import { FavoriteButton } from "./favorite-button";

export function GameDetail({
    gameInfo,
    feedbackList,
    isPublisher,
    user,
    onRefresh,
    error,
}: {
    gameInfo: GameInfo | null;
    feedbackList: FeedbackPost[];
    isPublisher: boolean;
    user: User | null;
    onRefresh?: () => void;
    error?: string;
}) {
    const theme = useTheme();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    function handleOpenCreateDialog() {
        setCreateDialogOpen(true);
    }

    function handleCloseCreateDialog() {
        setCreateDialogOpen(false);
    }

    if (error || !gameInfo) {
        return (
            <Container maxWidth="lg" sx={{ py: 2 }}>
                <Alert severity="error" variant="outlined">
                    {error ?? "ゲーム情報の取得に失敗しました。"}
                </Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ py: 2 }}>
            <Card>
                <CardContent>
                    <Stack spacing={2}>
                        <Stack
                            direction={{ xs: "column", md: "row" }}
                            spacing={2}
                        >
                            <Avatar
                                variant="square"
                                src={gameInfo.iconURL}
                                sx={{ width: 160, height: 160 }}
                            />
                            <Stack spacing={1} sx={{ flexGrow: 1 }}>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{
                                        alignItems: "center",
                                    }}
                                >
                                    <Typography variant="h4" component="h1">
                                        {gameInfo.title}
                                    </Typography>
                                    <FavoriteButton
                                        gameId={gameInfo.id}
                                        initialFavorited={gameInfo.isFavorited}
                                    />
                                </Stack>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{
                                        alignItems: "center",
                                    }}
                                >
                                    <Typography
                                        variant="body2"
                                        color="textSecondary"
                                    >
                                        投稿者
                                    </Typography>
                                    <UserInline
                                        user={{
                                            id: gameInfo.publisher.id,
                                            name: gameInfo.publisher.name,
                                            image: gameInfo.publisher.image,
                                        }}
                                        textVariant="body2"
                                        avatarSize={20}
                                    />
                                </Stack>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{
                                        alignItems: "center",
                                    }}
                                >
                                    <Typography
                                        variant="body2"
                                        color="textSecondary"
                                    >
                                        プレイ数:{" "}
                                        {gameInfo.playCount.toLocaleString()} 回
                                    </Typography>
                                </Stack>
                                <Typography
                                    variant="body1"
                                    sx={{ whiteSpace: "pre-wrap" }}
                                >
                                    {renderTextWithLinks(gameInfo.description)}
                                </Typography>
                                <Box
                                    sx={{
                                        display: { xs: "grid", md: "flex" },
                                        gridTemplateColumns: {
                                            xs: "1fr",
                                            sm: "repeat(2, 1fr)",
                                        },
                                        alignItems: { md: "center" },
                                        gap: 1,
                                        ...verticalButtonSx,
                                    }}
                                >
                                    <Button
                                        startIcon={<Add />}
                                        variant="outlined"
                                        onClick={handleOpenCreateDialog}
                                        sx={{
                                            borderColor:
                                                theme.palette.primary.light,
                                            color: theme.palette.primary.light,
                                        }}
                                    >
                                        部屋を作る
                                    </Button>
                                    {gameInfo.hasScoreboard && (
                                        <Button
                                            startIcon={<Leaderboard />}
                                            variant="outlined"
                                            component={Link}
                                            href={`/game/${gameInfo.id}/stats`}
                                            sx={{
                                                borderColor:
                                                    theme.palette.text
                                                        .secondary,
                                                color: theme.palette.text
                                                    .secondary,
                                            }}
                                        >
                                            統計を見る
                                        </Button>
                                    )}
                                    {gameInfo.hasScoreboard && isPublisher && (
                                        <Button
                                            startIcon={<Settings />}
                                            variant="outlined"
                                            component={Link}
                                            href={`/game/${gameInfo.id}/stats/edit`}
                                            sx={{
                                                borderColor:
                                                    theme.palette.text
                                                        .secondary,
                                                color: theme.palette.text
                                                    .secondary,
                                            }}
                                        >
                                            見せ方を設定
                                        </Button>
                                    )}
                                    {isPublisher && (
                                        <Button
                                            startIcon={<Article />}
                                            variant="outlined"
                                            component={Link}
                                            href={`/game/${gameInfo.id}/logs`}
                                            sx={{
                                                borderColor:
                                                    theme.palette.text
                                                        .secondary,
                                                color: theme.palette.text
                                                    .secondary,
                                            }}
                                        >
                                            ログを見る
                                        </Button>
                                    )}
                                </Box>
                                <CreditPanel
                                    credit={gameInfo.credit}
                                    contentId={gameInfo.contentId}
                                    titleCredits={gameInfo.titleCredits}
                                />
                            </Stack>
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>

            {gameInfo.hasScoreboard && (
                <Box id="stats" sx={{ mt: 3 }}>
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", mb: 2 }}
                    >
                        <Leaderboard fontSize="large" />
                        <Typography variant="h5" component="h2">
                            みんなの記録
                        </Typography>
                    </Stack>
                    <GameStatsSummary gameId={gameInfo.id} />
                </Box>
            )}

            <Box id="feedback" sx={{ mt: 3 }}>
                <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
                    フィードバック
                </Typography>
                <FeedbackPanel
                    gameId={gameInfo.id}
                    feedbackList={feedbackList}
                    isPublisher={isPublisher}
                    user={user}
                    onRefresh={onRefresh}
                />
            </Box>
            <PlayCreateDialog
                open={createDialogOpen}
                onClose={handleCloseCreateDialog}
                game={gameInfo}
                user={user}
                afterCreate={{ action: "navigate" }}
            />
        </Container>
    );
}
