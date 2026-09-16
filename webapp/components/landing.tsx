"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    Avatar,
    Box,
    Button,
    Card,
    CardActionArea,
    Chip,
    Container,
    Dialog,
    DialogContent,
    DialogTitle,
    GlobalStyles,
    Grid,
    IconButton,
    Skeleton,
    Stack,
    Tooltip,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import {
    Add,
    Close,
    Lock,
    Login,
    MeetingRoom,
    NoAccounts,
    Person,
    SportsEsports,
} from "@mui/icons-material";
import { AnonymousPlayInfo, GameInfo, PlayInfo } from "@/lib/types";
import { useAuth } from "@/lib/client/useAuth";
import { useGameList } from "@/lib/client/useGameList";
import { useAnonymousPlayList, usePlayList } from "@/lib/client/usePlayList";
import { useLocalMutes } from "@/lib/client/useLocalMutes";
import { UserInline } from "./user-inline";
import { SignIn } from "./sign-in";

function SoftBreak({ xsOnly = false }: { xsOnly?: boolean }) {
    return (
        <Box
            component="br"
            sx={xsOnly ? { display: { xs: "inline", sm: "none" } } : undefined}
        />
    );
}

function repeatToFill<T>(items: T[], min: number): T[] {
    if (items.length === 0) {
        return [];
    }
    const result: T[] = [];
    while (result.length < min) {
        result.push(...items);
    }
    return result;
}

function HeroMosaic({
    games,
    onRequestSignIn,
}: {
    games: GameInfo[];
    onRequestSignIn: () => void;
}) {
    const theme = useTheme();
    const icons = useMemo(() => games.map((g) => g.iconURL), [games]);
    const wallIcons = useMemo(() => repeatToFill(icons, 48), [icons]);
    const stripIcons = useMemo(() => repeatToFill(icons, 12), [icons]);

    return (
        <Box
            sx={{
                position: "relative",
                overflow: "hidden",
                borderRadius: { xs: 0, sm: 2 },
                minHeight: { xs: 360, sm: 420 },
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                mb: 4,
            }}
        >
            {/* 背景: アイコンの壁 */}
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
                    gridAutoRows: "72px",
                    gap: 0.5,
                    opacity: 0.35,
                    filter: "blur(1px)",
                }}
            >
                {wallIcons.map((src, i) => (
                    <Box
                        key={`wall-${i}`}
                        component="img"
                        src={src}
                        alt=""
                        loading="lazy"
                        sx={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                        }}
                    />
                ))}
            </Box>
            {/* 可読性確保のためのグラデーションオーバーレイ */}
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    inset: 0,
                    background: `linear-gradient(135deg, ${alpha(
                        theme.palette.background.default,
                        0.92,
                    )} 0%, ${alpha(
                        theme.palette.primary.dark,
                        0.75,
                    )} 55%, ${alpha(
                        theme.palette.background.default,
                        0.9,
                    )} 100%)`,
                }}
            />
            {/* 前景: キャッチコピー & CTA */}
            <Container
                maxWidth="md"
                sx={{
                    position: "relative",
                    textAlign: "center",
                    py: 6,
                }}
            >
                <Typography
                    variant="h3"
                    component="h1"
                    sx={{
                        fontWeight: 700,
                        mb: 2,
                        fontSize: { xs: "2rem", sm: "2.5rem", md: "2.75rem" },
                    }}
                >
                    いろいろなゲームで、
                    <SoftBreak xsOnly />
                    みんなと遊ぼう。
                </Typography>
                <Typography
                    variant="h6"
                    component="p"
                    color="textSecondary"
                    sx={{ mb: 4, fontWeight: 400 }}
                >
                    投稿されたゲームで、
                    <SoftBreak xsOnly />
                    いつでも対戦・協力プレイ。
                    <SoftBreak />
                    サインイン不要で、
                    <SoftBreak xsOnly />
                    今すぐみんなと遊べる。
                </Typography>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ justifyContent: "center" }}
                >
                    <Button
                        component={Link}
                        href="/new-play"
                        variant="contained"
                        size="large"
                        startIcon={<Add />}
                    >
                        新しい部屋を作って遊ぶ
                    </Button>
                    <Button
                        component={Link}
                        href="/new-play"
                        variant="outlined"
                        size="large"
                        startIcon={<SportsEsports />}
                        sx={{
                            borderColor: theme.palette.primary.light,
                            color: theme.palette.primary.light,
                        }}
                    >
                        ゲームを見る
                    </Button>
                </Stack>
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        mt: 2,
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    <Typography variant="body2" color="textSecondary">
                        アカウントをお持ちの方は
                    </Typography>
                    <Button
                        onClick={onRequestSignIn}
                        variant="text"
                        size="large"
                        startIcon={<Login />}
                    >
                        サインイン
                    </Button>
                </Stack>
            </Container>
            {/* 前景下部: 横スクロールで流れるアイコンの帯 */}
            {stripIcons.length > 0 && (
                <Box
                    aria-hidden
                    sx={{
                        position: "relative",
                        overflow: "hidden",
                        py: 1,
                        maskImage:
                            "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
                        WebkitMaskImage:
                            "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            width: "max-content",
                            gap: 1,
                            animation: "ap-marquee 40s linear infinite",
                            "@media (prefers-reduced-motion: reduce)": {
                                animation: "none",
                            },
                        }}
                    >
                        {/* シームレスなループのため 2 周分並べる */}
                        {[...stripIcons, ...stripIcons].map((src, i) => (
                            <Avatar
                                key={`strip-${i}`}
                                variant="rounded"
                                src={src}
                                sx={{ width: 56, height: 56 }}
                            />
                        ))}
                    </Box>
                </Box>
            )}
        </Box>
    );
}

function RoomTile({
    play,
    onClick,
}: {
    play: AnonymousPlayInfo;
    onClick: () => void;
}) {
    const theme = useTheme();
    return (
        <Card sx={{ height: "100%" }}>
            <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
                <Box sx={{ position: "relative" }}>
                    <Avatar
                        variant="square"
                        src={play.game.iconURL}
                        alt={play.game.title}
                        sx={{ width: "100%", height: "auto", aspectRatio: "1" }}
                    />
                    <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ position: "absolute", top: 4, right: 4 }}
                    >
                        {play.isLimited && (
                            <Tooltip arrow title="入室の言葉が必要な部屋です">
                                <Box
                                    sx={{
                                        bgcolor: alpha(
                                            theme.palette.background.default,
                                            0.8,
                                        ),
                                        borderRadius: 1,
                                        p: 0.25,
                                        display: "flex",
                                    }}
                                >
                                    <Lock fontSize="small" />
                                </Box>
                            </Tooltip>
                        )}
                        {play.requireSignIn && (
                            <Tooltip
                                arrow
                                title="サインインしたユーザーのみ参加できる部屋です"
                            >
                                <Box
                                    sx={{
                                        bgcolor: alpha(
                                            theme.palette.background.default,
                                            0.8,
                                        ),
                                        borderRadius: 1,
                                        p: 0.25,
                                        display: "flex",
                                    }}
                                >
                                    <NoAccounts fontSize="small" />
                                </Box>
                            </Tooltip>
                        )}
                    </Stack>
                    <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            right: 0,
                            alignItems: "center",
                            px: 0.5,
                            py: 0.25,
                            bgcolor: alpha(
                                theme.palette.background.default,
                                0.65,
                            ),
                        }}
                    >
                        <Person fontSize="small" />
                        <Typography variant="caption">
                            {play.participants} 人
                        </Typography>
                    </Stack>
                </Box>
            </CardActionArea>
        </Card>
    );
}

function OwnRoomRow({ play }: { play: PlayInfo }) {
    return (
        <Card>
            <CardActionArea component={Link} href={`/play/${play.id}`}>
                <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{ alignItems: "center", p: 1 }}
                >
                    <Avatar
                        variant="rounded"
                        src={play.game.iconURL}
                        alt={play.game.title}
                        sx={{ width: 48, height: 48 }}
                    />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" noWrap>
                            {play.playName}
                        </Typography>
                        <Typography
                            variant="caption"
                            color="textSecondary"
                            noWrap
                            component="p"
                        >
                            {play.game.title}・{play.participants} 人
                        </Typography>
                    </Box>
                    <Button
                        component="span"
                        variant="contained"
                        startIcon={<MeetingRoom />}
                        sx={{ flexShrink: 0 }}
                    >
                        戻る
                    </Button>
                </Stack>
            </CardActionArea>
        </Card>
    );
}

function OwnRoomsSection({ guestId }: { guestId: string }) {
    const { list } = usePlayList(undefined, guestId);
    const rooms = list?.flat() ?? [];

    if (rooms.length === 0) {
        return null;
    }

    return (
        <Container maxWidth="lg" sx={{ py: 2 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                あなたが作った部屋
            </Typography>
            <Stack spacing={1}>
                {rooms.map((play) => (
                    <OwnRoomRow key={play.id} play={play} />
                ))}
            </Stack>
        </Container>
    );
}

function LiveRoomsSection({
    onRequestSignIn,
}: {
    onRequestSignIn: () => void;
}) {
    const { isLoading, list, isEmpty } = useAnonymousPlayList();
    const localMutes = useLocalMutes();
    // 未サインイン利用者のミュートは端末内にしかないためここで落とす
    const rooms = useMemo(
        () =>
            (list?.flat() ?? []).filter(
                (room) => !localMutes.isMuted(room.ownerAnonKey),
            ),
        [list, localMutes],
    );

    if (isLoading) {
        return (
            <Box sx={{ mb: 5 }}>
                <Skeleton variant="text" width={280} height={40} />
                <Skeleton variant="rounded" width="100%" height={120} />
            </Box>
        );
    }
    if (isEmpty || rooms.length === 0) {
        return null;
    }

    return (
        <Box sx={{ mb: 5 }}>
            <Stack
                direction="row"
                sx={{
                    alignItems: "center",
                    mb: 0.5,
                    flexWrap: "wrap",
                    // spacing は margin-left で実装されるため、
                    // 折り返した 2 行目の先頭がインデントされてしまう
                    columnGap: 1.5,
                    rowGap: 0.5,
                }}
            >
                <Typography variant="h5" component="h2">
                    今この部屋で遊ばれています
                </Typography>
                <Chip
                    size="small"
                    variant="outlined"
                    label={`${rooms.length} 部屋`}
                />
            </Stack>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                サインインすると部屋一覧が見られます。
            </Typography>
            <Grid container spacing={1.5}>
                {rooms.map((play) => (
                    <Grid key={play.id} size={{ xs: 4, sm: 3, md: 2 }}>
                        <RoomTile play={play} onClick={onRequestSignIn} />
                    </Grid>
                ))}
            </Grid>
            <Button
                onClick={onRequestSignIn}
                variant="outlined"
                size="large"
                startIcon={<Login />}
                sx={{ mt: 2 }}
            >
                サインインして部屋一覧を見る
            </Button>
        </Box>
    );
}

function LatestGamesSection({ games }: { games: GameInfo[] }) {
    if (games.length === 0) {
        return null;
    }
    return (
        <Box sx={{ mb: 5 }}>
            <Stack
                direction="row"
                spacing={1}
                sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 2,
                }}
            >
                <Typography variant="h5" component="h2">
                    新着ゲーム
                </Typography>
                <Button component={Link} href="/new-play" size="large">
                    ゲーム一覧を見る
                </Button>
            </Stack>
            <Grid container spacing={2}>
                {games.map((game) => (
                    <Grid key={game.id} size={{ xs: 6, sm: 4, md: 3 }}>
                        <Card
                            sx={{
                                height: "100%",
                                transition: "all 0.2s",
                                "&:hover": {
                                    transform: "translateY(-4px)",
                                    boxShadow: 6,
                                },
                            }}
                        >
                            <CardActionArea
                                component={Link}
                                href={`/game/${game.id}`}
                                sx={{ height: "100%" }}
                            >
                                <Box sx={{ position: "relative" }}>
                                    <Avatar
                                        variant="square"
                                        src={game.iconURL}
                                        alt={game.title}
                                        sx={{
                                            width: "100%",
                                            height: "auto",
                                            aspectRatio: "1",
                                        }}
                                    />
                                    {game.description && (
                                        <Box
                                            aria-hidden
                                            sx={{
                                                position: "absolute",
                                                inset: 0,
                                                display: "flex",
                                                alignItems: "flex-end",
                                                p: 1,
                                                background:
                                                    "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0) 70%)",
                                            }}
                                        >
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: "#fff",
                                                    opacity: 0.85,
                                                    lineHeight: 1.35,
                                                    display: "-webkit-box",
                                                    WebkitLineClamp: 3,
                                                    WebkitBoxOrient: "vertical",
                                                    overflow: "hidden",
                                                }}
                                            >
                                                {game.description}
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>
                                <Box sx={{ p: 1.5 }}>
                                    <Typography
                                        variant="subtitle1"
                                        component="h3"
                                        noWrap
                                        title={game.title}
                                    >
                                        {game.title}
                                    </Typography>
                                    <Box sx={{ mt: 0.5 }}>
                                        {/* カード全体がリンクのため、UserInline 内でのリンクはなし */}
                                        <UserInline
                                            user={{
                                                name: game.publisher.name,
                                                image: game.publisher.image,
                                            }}
                                            avatarSize={20}
                                            textVariant="caption"
                                        />
                                    </Box>
                                    <Typography
                                        variant="caption"
                                        color="textSecondary"
                                    >
                                        プレイ数 {game.playCount}
                                    </Typography>
                                </Box>
                            </CardActionArea>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}

function SignInPromptDialog({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                }}
            >
                サインイン
                <IconButton aria-label="close" onClick={onClose}>
                    <Close />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pb: 3 }}>
                <Typography
                    variant="body2"
                    color="textSecondary"
                    sx={{ mb: 2 }}
                >
                    サインインすると部屋一覧が見られ、みんなが立てた部屋から探して参加できます。
                </Typography>
                <SignIn size="medium" />
            </DialogContent>
        </Dialog>
    );
}

export function GuestLanding() {
    const [user] = useAuth();
    const { list: gameList } = useGameList(undefined);
    const games = useMemo(() => gameList?.flat() ?? [], [gameList]);
    const [signInOpen, setSignInOpen] = useState(false);

    return (
        <Box>
            <GlobalStyles
                styles={{
                    "@keyframes ap-marquee": {
                        from: { transform: "translateX(0)" },
                        to: { transform: "translateX(-50%)" },
                    },
                }}
            />
            {/* ゲストは部屋一覧を見られないため、作った部屋へ戻る導線をここに置く */}
            {user?.authType === "guest" && (
                <OwnRoomsSection guestId={user.id} />
            )}
            <HeroMosaic
                games={games}
                onRequestSignIn={() => setSignInOpen(true)}
            />
            <Container maxWidth="lg" sx={{ py: 1 }}>
                <LatestGamesSection games={games} />
                <LiveRoomsSection onRequestSignIn={() => setSignInOpen(true)} />
            </Container>
            <SignInPromptDialog
                open={signInOpen}
                onClose={() => setSignInOpen(false)}
            />
        </Box>
    );
}
