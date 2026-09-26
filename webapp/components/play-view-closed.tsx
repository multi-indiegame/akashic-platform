"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Container,
    Stack,
    Tooltip,
    Typography,
    useTheme,
} from "@mui/material";
import {
    ArrowBack,
    Home,
    Lock,
    NoAccounts,
    SpeakerNotesOff,
    Videocam,
    VideocamOff,
    Add,
    InfoOutlined,
    Leaderboard,
    RateReview,
} from "@mui/icons-material";
import { GameInfo, User } from "@/lib/types";
import { verticalButtonSx } from "@/lib/client/theme";
import { UserInline } from "./user-inline";
import { CreditPanel } from "./credit-panel";
import { renderTextWithLinks } from "./text-with-links";
import { PlayCreateDialog } from "./play-create-dialog";
import { FavoriteButton } from "./favorite-button";

function formatDate(date?: Date): string {
    if (!date) return "--";
    try {
        return format(new Date(date), "yyyy/MM/dd HH:mm");
    } catch {
        return "--";
    }
}

export function ClosedPlayView({
    playName,
    isLimited,
    requireSignIn,
    chatEnabled,
    createdAt,
    endedAt,
    gameMaster,
    game,
    user,
}: {
    playName: string;
    isLimited: boolean;
    requireSignIn: boolean;
    chatEnabled: boolean;
    createdAt: Date;
    endedAt?: Date;
    gameMaster: {
        userId?: string;
        name: string;
        iconURL?: string;
    };
    game: GameInfo;
    user: User | null;
}) {
    const theme = useTheme();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);

    return (
        <Container maxWidth="md" sx={{ mt: 2 }}>
            <Stack spacing={2}>
                <Alert severity="info" variant="outlined">
                    この部屋はすでに終了しています。
                </Alert>
                <Stack direction="row">
                    <Button
                        component={Link}
                        href="/"
                        variant="text"
                        size="large"
                        startIcon={<ArrowBack fontSize="large" />}
                        sx={{ alignItems: "center" }}
                    >
                        <Home fontSize="large" />
                        <Typography variant="h5" sx={{ ml: 1 }}>
                            ホーム
                        </Typography>
                    </Button>
                </Stack>
                <Card>
                    <CardContent>
                        <Stack spacing={1}>
                            <Typography variant="h6">{playName}</Typography>
                            {(isLimited || requireSignIn || !chatEnabled) && (
                                <Stack
                                    direction="row"
                                    sx={{
                                        alignItems: "center",
                                        flexWrap: "wrap",
                                        // spacing は margin-left で実装されるため、
                                        // 折り返した 2 行目の先頭がインデントされてしまう
                                        columnGap: 2,
                                        rowGap: 0.5,
                                    }}
                                >
                                    {isLimited && (
                                        <Tooltip
                                            arrow
                                            title="この部屋は入室の言葉を知っている人だけが入室できました。"
                                        >
                                            <Stack
                                                direction="row"
                                                spacing={0.5}
                                                sx={{
                                                    alignItems: "center",
                                                }}
                                            >
                                                <Lock
                                                    fontSize="small"
                                                    sx={{
                                                        color: theme.palette
                                                            .text.secondary,
                                                    }}
                                                />
                                                <Typography
                                                    variant="body2"
                                                    color="textSecondary"
                                                >
                                                    限定
                                                </Typography>
                                            </Stack>
                                        </Tooltip>
                                    )}
                                    {requireSignIn && (
                                        <Tooltip
                                            arrow
                                            title="この部屋はサインインしたユーザーのみ参加できました。"
                                        >
                                            <Stack
                                                direction="row"
                                                spacing={0.5}
                                                sx={{
                                                    alignItems: "center",
                                                }}
                                            >
                                                <NoAccounts
                                                    fontSize="small"
                                                    sx={{
                                                        color: theme.palette
                                                            .text.secondary,
                                                    }}
                                                />
                                                <Typography
                                                    variant="body2"
                                                    color="textSecondary"
                                                >
                                                    ゲスト禁止
                                                </Typography>
                                            </Stack>
                                        </Tooltip>
                                    )}
                                    {!chatEnabled && (
                                        <Tooltip
                                            arrow
                                            title="この部屋では部屋チャットが無効でした。"
                                        >
                                            <Stack
                                                direction="row"
                                                spacing={0.5}
                                                sx={{
                                                    alignItems: "center",
                                                }}
                                            >
                                                <SpeakerNotesOff
                                                    fontSize="small"
                                                    sx={{
                                                        color: theme.palette
                                                            .text.secondary,
                                                    }}
                                                />
                                                <Typography
                                                    variant="body2"
                                                    color="textSecondary"
                                                >
                                                    チャットOFF
                                                </Typography>
                                            </Stack>
                                        </Tooltip>
                                    )}
                                </Stack>
                            )}
                            <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={2}
                            >
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
                                        部屋主
                                    </Typography>
                                    <UserInline
                                        user={{
                                            id: gameMaster.userId,
                                            name: gameMaster.name,
                                            image: gameMaster.iconURL,
                                        }}
                                        textVariant="body2"
                                        avatarSize={24}
                                    />
                                </Stack>
                                <Stack direction="row" spacing={1}>
                                    <Typography
                                        variant="body2"
                                        color="textSecondary"
                                    >
                                        開始
                                    </Typography>
                                    <Typography variant="body2">
                                        {formatDate(createdAt)}
                                    </Typography>
                                </Stack>
                                <Stack direction="row" spacing={1}>
                                    <Typography
                                        variant="body2"
                                        color="textSecondary"
                                    >
                                        終了
                                    </Typography>
                                    <Typography variant="body2">
                                        {formatDate(endedAt)}
                                    </Typography>
                                </Stack>
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent>
                        <Stack spacing={2}>
                            <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={2}
                            >
                                <Avatar
                                    variant="square"
                                    src={game.iconURL}
                                    sx={{ width: 120, height: 120 }}
                                />
                                <Stack spacing={1} sx={{ flex: 1 }}>
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        sx={{
                                            alignItems: "center",
                                        }}
                                    >
                                        <Typography
                                            variant="h5"
                                            component={Link}
                                            href={`/game/${game.id}`}
                                            style={{
                                                color: "inherit",
                                                textDecoration: "none",
                                            }}
                                        >
                                            {game.title}
                                        </Typography>
                                        <Tooltip
                                            arrow
                                            title={
                                                game.streaming ? (
                                                    <Typography variant="body2">
                                                        このゲームはプレイ中の画面を配信したり、動画投稿することが許可されています。
                                                    </Typography>
                                                ) : (
                                                    <Typography variant="body2">
                                                        このゲームはプレイ中の画面を配信したり、動画投稿することを禁止しています。
                                                    </Typography>
                                                )
                                            }
                                        >
                                            <Stack
                                                direction="row"
                                                spacing={0.5}
                                                sx={{
                                                    color: game.streaming
                                                        ? theme.palette.success
                                                              .light
                                                        : theme.palette.error
                                                              .light,
                                                    cursor: "help",
                                                    alignItems: "center",
                                                }}
                                            >
                                                {game.streaming ? (
                                                    <Videocam
                                                        fontSize="small"
                                                        aria-label="配信OK"
                                                    />
                                                ) : (
                                                    <VideocamOff
                                                        fontSize="small"
                                                        aria-label="配信不可"
                                                    />
                                                )}
                                                <Typography variant="body2">
                                                    {game.streaming
                                                        ? "配信OK"
                                                        : "配信不可"}
                                                </Typography>
                                            </Stack>
                                        </Tooltip>
                                        <FavoriteButton
                                            gameId={game.id}
                                            initialFavorited={game.isFavorited}
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
                                            制作者
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            color="textSecondary"
                                        >
                                            プレイ数:{" "}
                                            {game.playCount.toLocaleString()} 回
                                        </Typography>
                                        <UserInline
                                            user={{
                                                id: game.publisher.id,
                                                name: game.publisher.name,
                                                image: game.publisher.image,
                                            }}
                                            textVariant="body2"
                                            avatarSize={20}
                                        />
                                    </Stack>
                                    <Typography
                                        variant="body1"
                                        sx={{ whiteSpace: "pre-wrap" }}
                                    >
                                        {renderTextWithLinks(game.description)}
                                    </Typography>
                                    <CreditPanel
                                        credit={game.credit}
                                        contentId={game.contentId}
                                    />
                                </Stack>
                            </Stack>
                            <Box
                                sx={{
                                    display: { xs: "grid", md: "flex" },
                                    gridTemplateColumns: {
                                        xs: "1fr",
                                        sm: "repeat(2, 1fr)",
                                    },
                                    alignItems: { md: "center" },
                                    justifyContent: { md: "flex-end" },
                                    gap: 1,
                                    ...verticalButtonSx,
                                }}
                            >
                                <Button
                                    startIcon={<Add />}
                                    variant="outlined"
                                    onClick={() => setCreateDialogOpen(true)}
                                    sx={{
                                        borderColor:
                                            theme.palette.primary.light,
                                        color: theme.palette.primary.light,
                                    }}
                                >
                                    部屋を作る
                                </Button>
                                <Button
                                    startIcon={<InfoOutlined />}
                                    component={Link}
                                    href={`/game/${game.id}`}
                                    variant="outlined"
                                    sx={{
                                        borderColor:
                                            theme.palette.text.secondary,
                                        color: theme.palette.text.secondary,
                                    }}
                                >
                                    詳細
                                </Button>
                                {game.hasScoreboard && (
                                    <Button
                                        startIcon={<Leaderboard />}
                                        component={Link}
                                        href={`/game/${game.id}/stats`}
                                        variant="outlined"
                                        sx={{
                                            borderColor:
                                                theme.palette.text.secondary,
                                            color: theme.palette.text.secondary,
                                        }}
                                    >
                                        統計を見る
                                    </Button>
                                )}
                                <Button
                                    startIcon={<RateReview />}
                                    component={Link}
                                    href={`/game/${game.id}#feedback`}
                                    variant="outlined"
                                    sx={{
                                        borderColor:
                                            theme.palette.text.secondary,
                                        color: theme.palette.text.secondary,
                                    }}
                                >
                                    フィードバックを送る
                                </Button>
                            </Box>
                        </Stack>
                    </CardContent>
                </Card>
            </Stack>

            <PlayCreateDialog
                open={createDialogOpen}
                onClose={() => setCreateDialogOpen(false)}
                game={game}
                user={user}
                afterCreate={{ action: "navigate" }}
            />
        </Container>
    );
}
