"use client";

import Link from "next/link";
import {
    Avatar,
    Button,
    Card,
    CardContent,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { ArrowBack, Settings, Share, X } from "@mui/icons-material";
import { GameInfo } from "@/lib/types";
import { UserInline } from "./user-inline";

/**
 * 統計ページの見出し。
 */
export function GameStatsHeader({
    game,
    canEdit,
    onShare,
    onPostToX,
}: {
    game: GameInfo;
    canEdit: boolean;
    onShare: () => void;
    onPostToX: () => void;
}) {
    const theme = useTheme();
    return (
        <Stack spacing={2}>
            <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
                <Button
                    component={Link}
                    href={`/game/${game.id}`}
                    variant="text"
                    size="large"
                    startIcon={<ArrowBack fontSize="large" />}
                    sx={{ color: "inherit", alignItems: "center" }}
                >
                    <Typography variant="h6">ゲームの詳細</Typography>
                </Button>
                <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
                    <Button
                        variant="outlined"
                        startIcon={<Share />}
                        onClick={onShare}
                        sx={{
                            borderColor: theme.palette.text.secondary,
                            color: theme.palette.text.secondary,
                        }}
                    >
                        共有する
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<X />}
                        onClick={onPostToX}
                        sx={{
                            borderColor: theme.palette.text.secondary,
                            color: theme.palette.text.secondary,
                        }}
                    >
                        シェア
                    </Button>
                    {canEdit && (
                        <Button
                            component={Link}
                            href={`/game/${game.id}/stats/edit`}
                            variant="outlined"
                            startIcon={<Settings />}
                            sx={{
                                borderColor: theme.palette.text.secondary,
                                color: theme.palette.text.secondary,
                            }}
                        >
                            見せ方を設定
                        </Button>
                    )}
                </Stack>
            </Stack>
            <Card variant="outlined">
                <CardContent>
                    <Stack direction="row" spacing={2}>
                        <Avatar
                            variant="square"
                            src={game.iconURL}
                            alt=""
                            sx={{ width: 72, height: 72 }}
                        />
                        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                                variant="h6"
                                component={Link}
                                href={`/game/${game.id}`}
                                style={{
                                    color: "inherit",
                                    textDecoration: "none",
                                }}
                            >
                                {game.title}
                            </Typography>
                            <Stack
                                direction="row"
                                spacing={1}
                                sx={{ alignItems: "center", flexWrap: "wrap" }}
                            >
                                <Typography
                                    variant="body2"
                                    color="textSecondary"
                                >
                                    投稿者
                                </Typography>
                                <UserInline
                                    user={{
                                        id: game.publisher.id,
                                        name: game.publisher.name,
                                        image: game.publisher.image,
                                    }}
                                    textVariant="body2"
                                    avatarSize={24}
                                />
                                <Typography
                                    variant="body2"
                                    color="textSecondary"
                                >
                                    遊ばれた回数 {game.playCount}
                                </Typography>
                            </Stack>
                        </Stack>
                    </Stack>
                </CardContent>
            </Card>
        </Stack>
    );
}
