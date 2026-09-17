"use client";

import { ChangeEvent, useState } from "react";
import Link from "next/link";
import { useDebounce } from "use-debounce";
import { formatDistance } from "date-fns";
import { ja } from "date-fns/locale";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    Container,
    Divider,
    Grid,
    InputAdornment,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Skeleton,
    Stack,
    TextField,
    Tooltip,
    Typography,
    useTheme,
} from "@mui/material";
import {
    Add,
    Person,
    AccessTime,
    Search,
    SportsEsports,
    Link as LinkIcon,
    Lock,
    NoAccounts,
    SpeakerNotesOff,
} from "@mui/icons-material";
import { PlayInfo } from "@/lib/types";
import { useLocalMutes } from "@/lib/client/useLocalMutes";
import { usePlayList } from "@/lib/client/usePlayList";
import { UserInline } from "./user-inline";
import { SignInDialog } from "./sign-in-dialog";

function Loading() {
    return (
        <Box>
            <Skeleton variant="rounded" width="100%" />
        </Box>
    );
}

function NoResult() {
    const theme = useTheme();
    return (
        <Box>
            <Typography variant="body1" color="textSecondary" align="center">
                ゲームが見つかりませんでした
            </Typography>
        </Box>
    );
}

function PlayGrid({ list }: { list: PlayInfo[] }) {
    const theme = useTheme();
    const localMutes = useLocalMutes();
    // サインイン利用者の分はサーバーで除外済み。
    // 未サインイン利用者のミュートは端末内にしかないためここで落とす
    const visible = list.filter(
        (info) => !localMutes.isMuted(info.gameMaster.anonKey),
    );
    return (
        <Grid container spacing={2}>
            {visible.map((info) => (
                <Grid
                    key={info.id}
                    size={{
                        xs: 12,
                        sm: 6,
                        md: 4,
                        lg: 3,
                    }}
                >
                    <Card
                        sx={{
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            transition: "all 0.2s",
                            "&:hover": {
                                transform: "translateY(-4px)",
                                boxShadow: 6,
                            },
                        }}
                    >
                        <CardContent
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                height: "100%",
                            }}
                        >
                            <Typography variant="h6" component="h2">
                                {info.playName}
                            </Typography>
                            {(info.isLimited ||
                                info.requireSignIn ||
                                !info.chatEnabled) && (
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
                                    {info.isLimited && (
                                        <Tooltip
                                            arrow
                                            title="この部屋に入室するには「入室の言葉」が必要です。"
                                        >
                                            <Stack
                                                spacing={1}
                                                direction="row"
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
                                    {info.requireSignIn && (
                                        <Tooltip
                                            arrow
                                            title="この部屋はサインインしたユーザーのみ参加できます。"
                                        >
                                            <Stack
                                                spacing={1}
                                                direction="row"
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
                                    {!info.chatEnabled && (
                                        <Tooltip
                                            arrow
                                            title="この部屋では部屋チャットが無効です。"
                                        >
                                            <Stack
                                                spacing={1}
                                                direction="row"
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
                            <Typography
                                variant="body2"
                                color="textSecondary"
                                sx={{
                                    mb: 1,
                                }}
                            >
                                {info.game.title}
                            </Typography>
                            <Avatar
                                variant="square"
                                src={info.game.iconURL}
                                sx={{
                                    width: 192,
                                    height: 192,
                                }}
                            />
                            <Stack
                                spacing={1}
                                sx={{
                                    my: 1,
                                    color: theme.palette.text.secondary,
                                }}
                            >
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{
                                        alignItems: "center",
                                    }}
                                >
                                    <Person />
                                    <Typography
                                        variant="body2"
                                        sx={{ ml: 1, mr: 2 }}
                                    >
                                        {info.participants} 人
                                    </Typography>
                                    <AccessTime />
                                    <Typography
                                        variant="body2"
                                        sx={{ ml: 1, flexGrow: 1 }}
                                    >
                                        {formatDistance(
                                            info.createdAt,
                                            new Date(),
                                            { addSuffix: true, locale: ja },
                                        )}
                                    </Typography>
                                </Stack>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{
                                        alignItems: "center",
                                    }}
                                >
                                    <Typography variant="body2">
                                        部屋主
                                    </Typography>
                                    <UserInline
                                        user={{
                                            id: info.gameMaster.userId,
                                            name: info.gameMaster.name,
                                            image: info.gameMaster.iconURL,
                                        }}
                                        textVariant="body2"
                                        avatarSize={20}
                                    />
                                </Stack>
                            </Stack>
                            <CardActions sx={{ marginTop: "auto" }}>
                                <Button
                                    variant="contained"
                                    size="large"
                                    component={Link}
                                    href={`/play/${info.id}`}
                                    fullWidth
                                >
                                    参加する
                                </Button>
                            </CardActions>
                        </CardContent>
                    </Card>
                </Grid>
            ))}
        </Grid>
    );
}

function LoadMore({ handleClickMore }: { handleClickMore: () => void }) {
    const theme = useTheme();
    return (
        <Button
            onClick={handleClickMore}
            sx={{
                display: "flex",
                mt: 2,
                mx: "auto",
                backgroundColor: theme.palette.background.paper,
            }}
            size="large"
        >
            もっと読む
        </Button>
    );
}

function GuestInstruction() {
    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                py: 6,
                px: 2,
            }}
        >
            <Typography variant="h5" component="h2" align="center">
                ゲームに参加するには
            </Typography>
            <List sx={{ width: "100%", maxWidth: 480 }}>
                <ListItem>
                    <ListItemIcon>
                        <SportsEsports color="primary" />
                    </ListItemIcon>
                    <ListItemText
                        primary="部屋を作成してゲームを開始する"
                        secondary={
                            <Button
                                component={Link}
                                href="/new-play"
                                variant="contained"
                                size="small"
                                startIcon={<Add />}
                                sx={{ mt: 1 }}
                            >
                                新しい部屋を作る
                            </Button>
                        }
                    />
                </ListItem>
                <ListItem>
                    <ListItemIcon>
                        <LinkIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                        primary="招待URLを開いて部屋に参加する"
                        secondary="友だちから共有された招待リンクを開いてください"
                    />
                </ListItem>
            </List>
            <Divider sx={{ width: "100%", maxWidth: 480 }} />
            <Alert
                variant="outlined"
                severity="info"
                sx={{ width: "100%", maxWidth: 480 }}
            >
                サインインすると部屋一覧が表示されます
            </Alert>
            <SignInDialog />
        </Box>
    );
}

export function PlayList({
    title = "ゲームで遊ぶ",
    description = "現在プレイ中の部屋",
    guestId,
    gameMasterId,
}: {
    title?: string;
    description?: string;
    guestId?: string;
    gameMasterId?: string;
}) {
    const theme = useTheme();
    const [keyword, setKeyword] = useState("");
    const [debouncedKeyword] = useDebounce(keyword, 500);
    const { isLoading, list, page, setPage, isEmpty, isEnd } = usePlayList(
        debouncedKeyword,
        guestId ?? gameMasterId,
    );

    function handleSearch(event: ChangeEvent<HTMLInputElement>) {
        setKeyword(event.target.value);
    }

    function handleClickMore() {
        setPage(page + 1);
    }

    if (guestId !== undefined) {
        if (isLoading) {
            return (
                <Container maxWidth="lg" sx={{ py: 2 }}>
                    <Loading />
                </Container>
            );
        }
        if (isEmpty || list == null) {
            return (
                <Container maxWidth="lg" sx={{ py: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1">
                            {title}
                        </Typography>
                    </Box>
                    <GuestInstruction />
                </Container>
            );
        }
        return (
            <Container maxWidth="lg" sx={{ py: 2 }}>
                <Stack spacing={2} sx={{ mb: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1">
                            {title}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                            自分が作成した部屋
                        </Typography>
                    </Box>
                    <Alert variant="outlined" severity="info">
                        サインインすると全ての部屋一覧が表示されます
                    </Alert>
                </Stack>
                <PlayGrid list={list.flat()} />
                {!isEnd && <LoadMore handleClickMore={handleClickMore} />}
            </Container>
        );
    }

    return (
        <Container
            maxWidth="lg"
            sx={{
                py: 2,
            }}
        >
            <Stack
                direction={{
                    xs: "column",
                    md: "row",
                }}
                spacing={1}
                sx={{
                    mb: 2,
                    justifyContent: "space-between",
                    alignItems: {
                        xs: "start",
                        md: "center",
                    },
                }}
            >
                <Box>
                    <Typography variant="h4" component="h1">
                        {title}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        {description}
                    </Typography>
                </Box>
                <TextField
                    placeholder="ゲーム名/部屋名で検索"
                    value={keyword}
                    onChange={handleSearch}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search />
                                </InputAdornment>
                            ),
                        },
                    }}
                    sx={{
                        flexGrow: 1,
                        width: {
                            xs: "100%",
                            md: "inherit",
                        },
                    }}
                />
                <Button
                    component={Link}
                    href="/new-play"
                    variant="contained"
                    size="large"
                    startIcon={<Add />}
                    sx={{
                        width: {
                            xs: "100%",
                            sm: "inherit",
                        },
                        alignSelf: { xs: "center", md: "inherit" },
                    }}
                >
                    新しい部屋を作る
                </Button>
            </Stack>
            {isLoading ? (
                <Loading />
            ) : list == null || isEmpty ? (
                <NoResult />
            ) : (
                <>
                    <PlayGrid list={list.flat()} />
                    {!isEnd && <LoadMore handleClickMore={handleClickMore} />}
                </>
            )}
        </Container>
    );
}
