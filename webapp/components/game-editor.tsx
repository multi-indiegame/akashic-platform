"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Container, Stack, useTheme } from "@mui/material";
import { GameInfo } from "@/lib/types";
import { useAuth } from "@/lib/client/useAuth";
import { SignInAlert } from "./sign-in-alert";
import { UserGameListSection } from "./user-game-list-section";
import { PlayCreateDialog } from "./play-create-dialog";

export function GameEditor() {
    const theme = useTheme();
    const [user] = useAuth();
    const [selectedGame, setSelectedGame] = useState<GameInfo>();
    const [dialogOpen, setDialogOpen] = useState(false);

    if (!user || user.authType === "guest") {
        const message = `投稿したゲームを編集するにはサインインが必要です。`;
        return <SignInAlert message={message} />;
    }

    function handleOpenDialog(game: GameInfo) {
        setSelectedGame(game);
        setDialogOpen(true);
    }

    function handleCloseDialog() {
        setDialogOpen(false);
    }

    return (
        <Container
            maxWidth="md"
            sx={{
                mt: 4,
                display: "flex",
                flexFlow: "column",
                alignItems: "center",
                gap: 4,
            }}
        >
            <UserGameListSection
                userId={user.id}
                title="投稿したゲーム"
                renderActions={(game: GameInfo, isTable: boolean) => (
                    <Stack direction={isTable ? "column" : "row"} spacing={1}>
                        <Button
                            variant="outlined"
                            component={Link}
                            href={`/game/${game.id}`}
                            sx={{
                                borderColor: theme.palette.primary.light,
                                color: theme.palette.primary.light,
                            }}
                        >
                            詳細
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={() => handleOpenDialog(game)}
                            sx={{
                                borderColor: theme.palette.primary.light,
                                color: theme.palette.primary.light,
                            }}
                        >
                            部屋を作る
                        </Button>
                        {game.hasScoreboard && (
                            <Button
                                variant="outlined"
                                component={Link}
                                href={`/game/${game.id}/stats/edit`}
                                sx={{
                                    borderColor: theme.palette.text.secondary,
                                    color: theme.palette.text.secondary,
                                }}
                            >
                                統計・称号の設定
                            </Button>
                        )}
                        <Button
                            variant="contained"
                            size="large"
                            component={Link}
                            href={`/game/${game.id}/edit`}
                        >
                            編集する
                        </Button>
                    </Stack>
                )}
            />
            <PlayCreateDialog
                open={dialogOpen}
                onClose={handleCloseDialog}
                game={selectedGame}
                user={user}
                afterCreate={{ action: "navigate" }}
            />
        </Container>
    );
}
