"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Container, useTheme } from "@mui/material";
import { InfoOutlined, Add, Settings, Edit } from "@mui/icons-material";
import { GameInfo } from "@/lib/types";
import { useAuth } from "@/lib/client/useAuth";
import { SignInAlert } from "./sign-in-alert";
import { UserGameListSection } from "./user-game-list-section";
import { GameActions } from "./game-list-table";
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
                    <GameActions isTable={isTable}>
                        <Button
                            startIcon={<InfoOutlined />}
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
                            startIcon={<Add />}
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
                                startIcon={<Settings />}
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
                            startIcon={<Edit />}
                            variant="contained"
                            size="large"
                            component={Link}
                            href={`/game/${game.id}/edit`}
                        >
                            編集する
                        </Button>
                    </GameActions>
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
