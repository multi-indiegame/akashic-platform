"use client";

import { ChangeEvent, useTransition, useState } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Container,
    FormControlLabel,
    InputAdornment,
    Radio,
    RadioGroup,
    Stack,
    Switch,
    TextField,
    Typography,
    useTheme,
} from "@mui/material";
import {
    ArrowBack,
    Lock,
    NoAccounts,
    Search,
    SpeakerNotesOff,
    SportsEsports,
    Add,
} from "@mui/icons-material";
import { messageKey, messages } from "@/lib/types";
import { registerPlay } from "@/lib/server/play-register";
import { useAuth } from "@/lib/client/useAuth";
import { STORAGE_KEYS, useLocalStorage } from "@/lib/client/useLocalStorage";
import { GameList } from "./game-list";

export function PlayForm({
    afterCreate,
    embedded,
}: {
    afterCreate: { action: "redirect" } | { action: "stay"; cb: () => void };
    embedded?: boolean;
}) {
    const theme = useTheme();
    const [user] = useAuth();
    const [selectedContent, setSelectedContent] = useState<number>();
    const [selectedGameTitle, setSelectedGameTitle] = useState<string>();
    const [keyword, setKeyword] = useState("");
    const [playName, setPlayName] = useLocalStorage(STORAGE_KEYS.ROOM_NAME, "");
    const [isLimited, setIsLimited] = useLocalStorage(
        STORAGE_KEYS.ROOM_IS_LIMITED,
        false,
    );
    const [joinWord, setJoinWord] = useLocalStorage(
        STORAGE_KEYS.ROOM_JOIN_WORD,
        "",
    );
    const [requireSignIn, setRequireSignIn] = useLocalStorage(
        STORAGE_KEYS.ROOM_REQUIRE_SIGN_IN,
        false,
    );
    const [chatEnabled, setChatEnabled] = useLocalStorage(
        STORAGE_KEYS.ROOM_CHAT_ENABLED,
        true,
    );
    const canRequireSignIn = !!user && user.authType !== "guest";
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string>();

    function handleSearch(event: ChangeEvent<HTMLInputElement>) {
        setKeyword(event.target.value);
    }

    function handlePlayName(event: ChangeEvent<HTMLInputElement>) {
        setPlayName(event.target.value);
    }
    function handleJoinWord(event: ChangeEvent<HTMLInputElement>) {
        setJoinWord(event.target.value);
    }

    function handleSubmit() {
        if (!selectedContent) {
            setError("ゲームを選択してください。");
        }
        if (!user) {
            setError("サインインしてください。");
        }
        if (selectedContent && user) {
            if (isLimited && !joinWord) {
                setError("限定部屋を作成する場合、入室の言葉が必要です。");
                return;
            }
            startTransition(async () => {
                const res = await registerPlay({
                    contentId: selectedContent,
                    playName,
                    isLimited,
                    joinWord,
                    requireSignIn: canRequireSignIn && requireSignIn,
                    chatEnabled,
                });
                if (res.ok) {
                    switch (afterCreate.action) {
                        case "redirect":
                            redirect(
                                `/play/${res.playId}?${messageKey}=${messages.play.registerSuccessful}`,
                            );
                        case "stay":
                            afterCreate.cb();
                            break;
                        default:
                            console.error(
                                "invalid afterCreate action",
                                afterCreate,
                            );
                    }
                } else {
                    switch (res.reason) {
                        case "InvalidParams":
                            setError(
                                "内部エラーが発生しました。入力内容を確認してもう一度投稿してください。",
                            );
                            break;
                        case "Drain":
                            setError(
                                "現在臨時メンテナンス中のため、部屋を作成できません。1時間ほど時間をおいてください。",
                            );
                            break;
                        case "GuestRoomLimitExceeded":
                            setError(
                                "ゲスト状態で作成できる部屋数の上限に達しました。",
                            );
                            break;
                        case "InternalError":
                        default:
                            setError(
                                "予期しないエラーが発生しました。時間をおいてリトライしてください。",
                            );
                            break;
                    }
                }
            });
        }
    }

    const effectiveRequireSignIn = canRequireSignIn && requireSignIn;

    const roomBadges =
        isLimited || effectiveRequireSignIn || !chatEnabled ? (
            <Stack
                direction="row"
                sx={{
                    flexWrap: "wrap",
                    // spacing は margin-left で実装されるため、
                    // 折り返した 2 行目の先頭がインデントされてしまう
                    gap: 0.5,
                    mt: 0.5,
                    color: theme.palette.text.secondary,
                }}
            >
                {isLimited && (
                    <Chip
                        icon={
                            <Lock
                                color="inherit"
                                sx={{
                                    color: theme.palette.text.secondary,
                                }}
                            />
                        }
                        label="限定"
                        size="small"
                        variant="outlined"
                        sx={{
                            color: theme.palette.text.secondary,
                        }}
                    />
                )}
                {effectiveRequireSignIn && (
                    <Chip
                        icon={
                            <NoAccounts
                                color="inherit"
                                sx={{
                                    color: theme.palette.text.secondary,
                                }}
                            />
                        }
                        label="ゲスト参加禁止"
                        size="small"
                        variant="outlined"
                        sx={{
                            color: theme.palette.text.secondary,
                        }}
                    />
                )}
                {!chatEnabled && (
                    <Chip
                        icon={
                            <SpeakerNotesOff
                                color="inherit"
                                sx={{
                                    color: theme.palette.text.secondary,
                                }}
                            />
                        }
                        label="チャットOFF"
                        size="small"
                        variant="outlined"
                        sx={{
                            color: theme.palette.text.secondary,
                        }}
                    />
                )}
            </Stack>
        ) : null;

    const bottomBar = selectedContent ? (
        <Box
            sx={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1200,
                bgcolor: "background.paper",
                borderTop: 1,
                borderColor: "divider",
                boxShadow: 4,
                px: { xs: 2, sm: 3 },
                py: 1.5,
            }}
        >
            <Container maxWidth="md" disableGutters>
                <Stack spacing={1}>
                    {error && (
                        <Alert
                            variant="outlined"
                            severity="error"
                            sx={{ py: 0.5 }}
                        >
                            {error}
                        </Alert>
                    )}
                    <Stack
                        direction="row"
                        spacing={2}
                        sx={{
                            alignItems: "center",
                        }}
                    >
                        <Stack
                            spacing={0}
                            sx={{
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            <Typography variant="caption" color="textSecondary">
                                選択中のゲーム
                            </Typography>
                            <Typography
                                variant="body1"
                                noWrap
                                sx={{
                                    fontWeight: "medium",
                                }}
                            >
                                {selectedGameTitle}
                            </Typography>
                            {roomBadges}
                        </Stack>
                        <Button
                            startIcon={<Add />}
                            type="submit"
                            variant="contained"
                            size="large"
                            color="primary"
                            loading={isPending}
                            disabled={isPending}
                            sx={{ flexShrink: 0 }}
                        >
                            部屋を作成する
                        </Button>
                    </Stack>
                </Stack>
            </Container>
        </Box>
    ) : null;

    const cardContent = (
        <CardContent sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Box>
                    <Typography variant="h6" gutterBottom>
                        部屋名
                    </Typography>
                    <TextField
                        placeholder={`例）「${selectedGameTitle ?? "〇〇ゲーム"}」で遊ぼう！`}
                        value={playName}
                        onChange={handlePlayName}
                        fullWidth
                        slotProps={{
                            htmlInput: {
                                maxLength: 100,
                            },
                        }}
                        helperText={`最大 100 文字`}
                    />
                </Box>
                <Box>
                    <Typography variant="h6" gutterBottom>
                        公開設定
                    </Typography>
                    <RadioGroup
                        value={isLimited ? "limited" : "public"}
                        onChange={(event) =>
                            setIsLimited(event.target.value === "limited")
                        }
                    >
                        <FormControlLabel
                            value="public"
                            control={<Radio />}
                            label="公開: 部屋一覧から誰でもそのまま入室できます。"
                        />
                        <FormControlLabel
                            value="limited"
                            control={<Radio />}
                            label="限定: 部屋一覧には表示されますが、入室の言葉がないと入れません。"
                        />
                    </RadioGroup>
                </Box>
                {isLimited && (
                    <Box>
                        <Typography variant="h6" gutterBottom>
                            入室の言葉
                        </Typography>
                        <TextField
                            value={joinWord}
                            onChange={handleJoinWord}
                            fullWidth
                            slotProps={{
                                htmlInput: {
                                    maxLength: 100,
                                },
                            }}
                            helperText="部屋一覧から入室するときに必要な言葉です。"
                        />
                    </Box>
                )}
                <Box>
                    <Typography variant="h6" gutterBottom>
                        参加者設定
                    </Typography>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={canRequireSignIn && requireSignIn}
                                onChange={(event) =>
                                    setRequireSignIn(event.target.checked)
                                }
                                disabled={!canRequireSignIn}
                            />
                        }
                        label="ゲスト参加を禁止"
                    />
                    <Typography variant="body2" color="textSecondary">
                        {canRequireSignIn
                            ? "有効にすると、サインインしたユーザーのみ参加でき、ユーザー名が固定で表示されます。"
                            : "この設定を利用するにはサインインが必要です。"}
                    </Typography>
                </Box>
                <Box>
                    <Typography variant="h6" gutterBottom>
                        チャット設定
                    </Typography>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={chatEnabled}
                                onChange={(event) =>
                                    setChatEnabled(event.target.checked)
                                }
                            />
                        }
                        label="部屋チャットを有効にする"
                    />
                    <Typography variant="body2" color="textSecondary">
                        有効にすると、部屋にいる人同士でコメントをやりとりできます。
                    </Typography>
                </Box>
                <Box>
                    <Typography variant="h6" gutterBottom>
                        ゲーム選択{" "}
                        {!embedded && (
                            <Typography component="span" color="error">
                                *
                            </Typography>
                        )}
                    </Typography>
                    <TextField
                        placeholder="ゲーム名で検索"
                        value={keyword}
                        onChange={handleSearch}
                        fullWidth
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search />
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                </Box>
                <GameList
                    keyword={keyword}
                    selected={selectedContent}
                    setSelected={setSelectedContent}
                    setGameTitle={setSelectedGameTitle}
                />
            </Stack>
        </CardContent>
    );

    if (embedded) {
        return (
            <Stack
                component="form"
                action={handleSubmit}
                sx={{ mb: selectedContent ? 10 : 0 }}
                spacing={2}
            >
                <Card sx={{ width: "100%" }}>{cardContent}</Card>
                {error && (
                    <Alert variant="outlined" severity="error">
                        {error}
                    </Alert>
                )}
                <Button
                    startIcon={<Add />}
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    color={!selectedContent ? "inherit" : "primary"}
                    loading={isPending}
                    disabled={isPending}
                >
                    部屋を作成する
                </Button>
                {bottomBar}
            </Stack>
        );
    }

    return (
        <Container
            component="form"
            action={handleSubmit}
            maxWidth="md"
            sx={{
                mt: 4,
                mb: selectedContent ? 10 : 4,
                display: "flex",
                flexFlow: "column",
                alignItems: "center",
                gap: 4,
            }}
        >
            <Stack
                direction="row"
                spacing={2}
                sx={{
                    width: "100%",
                    alignItems: "center",
                }}
            >
                <Button
                    component={Link}
                    href="/"
                    variant="text"
                    size="large"
                    startIcon={<ArrowBack fontSize="large" />}
                    sx={{ flex: 1, justifyContent: "start" }}
                />
                <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    <SportsEsports fontSize="large" />
                    <Typography variant="h4" component="h1">
                        部屋を作成する
                    </Typography>
                </Stack>
                <Box sx={{ flex: 1 }} />
            </Stack>
            <Card sx={{ width: "100%" }}>{cardContent}</Card>
            {error && (
                <Alert variant="outlined" severity="error">
                    {error}
                </Alert>
            )}
            <Button
                startIcon={<Add />}
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                color={!selectedContent ? "inherit" : "primary"}
                loading={isPending}
                disabled={isPending}
            >
                部屋を作成する
            </Button>
            {bottomBar}
        </Container>
    );
}
