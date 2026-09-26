"use client";

import { useEffect, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Container,
    Divider,
    Skeleton,
    Stack,
    TextField,
    Typography,
    useTheme,
} from "@mui/material";
import { MeetingRoom } from "@mui/icons-material";
import { useAuth } from "@/lib/client/useAuth";
import { useCopyToClipboard } from "@/lib/client/useCopyToClipboard";
import { useLive } from "@/lib/client/useLive";
import { CopyLinkBox, CopyStatusSnackbar } from "./copy-link-box";
import { PlayForm } from "./play-form";
import { PlayView } from "./play-view";
import { SignInAlert } from "./sign-in-alert";
import { UserInline } from "./user-inline";

function LiveHeader({
    userId,
    name,
    iconURL,
    isOwner,
    isPlaying,
    width,
}: {
    userId: string;
    name: string;
    iconURL?: string;
    isOwner: boolean;
    isPlaying: boolean;
    width?: "narrow";
}) {
    const theme = useTheme();
    return (
        <>
            <Container maxWidth={width === "narrow" ? "sm" : "md"}>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{
                        my: 1,
                        alignItems: { xs: "stretch", sm: "center" },
                    }}
                >
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", margin: "auto" }}
                    >
                        <UserInline
                            user={{
                                id: userId,
                                name: name,
                                image: iconURL,
                            }}
                            textVariant="body1"
                            avatarSize={24}
                        />
                        <Typography variant="body1" color="textSecondary">
                            さんの部屋
                        </Typography>
                    </Stack>
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center", margin: "auto", ml: 1 }}
                    >
                        {isOwner && (
                            <Chip
                                label="あなたの部屋"
                                size="small"
                                variant="outlined"
                            />
                        )}
                        {isPlaying ? (
                            <Chip
                                label="ただいまプレイ中"
                                color="success"
                                size="small"
                                sx={{ opacity: 0.75 }}
                            />
                        ) : (
                            <Chip label="休憩中" color="default" size="small" />
                        )}
                    </Stack>
                </Stack>
            </Container>
            <Divider />
        </>
    );
}

function OwnerIdleGuide({
    liveUrl,
    onCopyLiveUrl,
}: {
    liveUrl?: string;
    onCopyLiveUrl: () => void;
}) {
    const theme = useTheme();
    return (
        <Card>
            <CardContent>
                <Stack spacing={2}>
                    <Typography variant="h6">
                        ゲームを起動していません
                    </Typography>
                    <Typography variant="body1">
                        ここはあなた専用の部屋です。
                        ゲームを起動するとこのページを開いている人と一緒に遊べます。
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        ここで起動したゲームは部屋一覧にも表示されます。
                    </Typography>
                    <Box
                        sx={{
                            borderRadius: 2,
                            p: 2,
                            backgroundColor: theme.palette.background.default,
                        }}
                    >
                        <Stack spacing={1}>
                            <Typography variant="subtitle1">
                                みんなを誘おう!
                            </Typography>
                            <CopyLinkBox
                                url={liveUrl}
                                onCopy={onCopyLiveUrl}
                                mode="dark"
                            />
                            <Typography variant="body2" color="textSecondary">
                                このリンクから来た人は、あなたがゲームを起動すると自動的に参加します。
                            </Typography>
                        </Stack>
                    </Box>
                </Stack>
            </CardContent>
        </Card>
    );
}

export function LiveContainer({ handle }: { handle: string }) {
    const theme = useTheme();
    const [joinWord, setJoinWord] = useState("");
    const [submittedJoinWord, setSubmittedJoinWord] = useState<string>();
    /**
     * NOTE: プレイ中はポーリングさせたくないため、プレイ中かどうか判定するため記憶する。
     * NOTE: isPlaying の値を更新した際に再レンダリングさせたくないので useRef を使用する
     */
    const isPlaying = useRef(false);
    /**
     * NOTE: プレイが終わった直後、まだ data にはまだ情報が残っている。
     * NOTE: 直前の id を保持することで待機状態に遷移させる
     */
    const closedPlayId = useRef<number>(undefined);
    const [user] = useAuth();
    const [liveUrl, setLiveUrl] = useState<string>();
    const {
        copyStatus: liveCopyStatus,
        copy: copyLiveUrl,
        clearCopyStatus: clearLiveCopyStatus,
    } = useCopyToClipboard();
    const container = useRef<HTMLDivElement>(null);

    const { isLoading, data, error, mutate } = useLive(
        handle,
        submittedJoinWord,
        !isPlaying.current,
    );

    // 表示中の部屋は常に data から導出する。終了直後の部屋は除外する。
    const liveInfo =
        data &&
        !data.requiresJoinWord &&
        data.info &&
        data.info.id !== closedPlayId.current
            ? data.info
            : undefined;
    isPlaying.current = !!liveInfo;

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        setLiveUrl(
            new URL(`/live/${handle}`, window.location.origin).toString(),
        );
    }, [handle]);

    function handleCopyLiveUrl() {
        if (liveUrl) {
            copyLiveUrl(liveUrl);
        }
    }

    function handleAfterCreate() {
        // 作成直後に最新の部屋を取得してプレイ画面に遷移
        mutate();
    }

    function handleAfterPlayClose() {
        setJoinWord("");
        closedPlayId.current = liveInfo?.id;
        setSubmittedJoinWord(undefined);
        isPlaying.current = false;
        // ポーリングを待たずに最新状態へ
        mutate();
    }

    function handleSubmitJoinWord(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmittedJoinWord(joinWord);
    }

    if (isLoading) {
        return (
            <Container maxWidth="md" sx={{ mt: 2 }}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        px: 2,
                        py: 1.5,
                        borderBottom: 1,
                        borderColor: "divider",
                    }}
                >
                    <Skeleton variant="circular" width={36} height={36} />
                    <Skeleton variant="text" width={120} />
                </Box>
                <Skeleton variant="rectangular" height={400} sx={{ mt: 1 }} />
            </Container>
        );
    }
    if (data?.requiresJoinWord && data.reason === "SignInRequired") {
        return (
            <>
                <LiveHeader
                    userId={data.owner.userId}
                    name={data.owner.name}
                    iconURL={data.owner.iconURL}
                    isOwner={false}
                    isPlaying={true}
                    width="narrow"
                />
                <SignInAlert message="ただいまサインイン必須設定でプレイしています。" />
            </>
        );
    }
    if (data?.requiresJoinWord && data.reason === "Banned") {
        return (
            <>
                <LiveHeader
                    userId={data.owner.userId}
                    name={data.owner.name}
                    iconURL={data.owner.iconURL}
                    isOwner={false}
                    isPlaying={true}
                    width="narrow"
                />
                <Container maxWidth="md" sx={{ mt: 2 }}>
                    <Alert variant="outlined" severity="error">
                        あなたはこの部屋に入室できません。
                    </Alert>
                </Container>
            </>
        );
    }
    if (data?.requiresJoinWord) {
        return (
            <>
                <LiveHeader
                    userId={data.owner.userId}
                    name={data.owner.name}
                    iconURL={data.owner.iconURL}
                    isOwner={false}
                    isPlaying={true}
                    width="narrow"
                />
                <Container maxWidth="sm" sx={{ mt: 2 }}>
                    <Card>
                        <CardContent>
                            <Stack
                                component="form"
                                spacing={2}
                                onSubmit={handleSubmitJoinWord}
                            >
                                {error && (
                                    <Alert severity="error" variant="outlined">
                                        {error}
                                    </Alert>
                                )}
                                {submittedJoinWord && (
                                    <Alert severity="error" variant="outlined">
                                        入室の言葉が正しくありません。
                                    </Alert>
                                )}
                                <Typography variant="h6">
                                    ただいま限定公開設定でプレイしています。
                                </Typography>
                                <Typography variant="body2">
                                    ゲームに参加するには入室の言葉が必要です。
                                </Typography>
                                <TextField
                                    label="入室の言葉"
                                    value={joinWord}
                                    onChange={(e) =>
                                        setJoinWord(e.target.value)
                                    }
                                    autoFocus
                                    fullWidth
                                />
                                <Button
                                    startIcon={<MeetingRoom />}
                                    type="submit"
                                    variant="contained"
                                >
                                    入室する
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>
                </Container>
            </>
        );
    }
    if (error || !data || !user) {
        return (
            <Container maxWidth="sm" sx={{ mt: 4 }}>
                <Alert severity="error" variant="outlined">
                    {error ??
                        "予期しないエラーが発生しました。画面を更新してください。"}
                </Alert>
            </Container>
        );
    }
    if (!liveInfo) {
        if (data.isGameMaster) {
            return (
                <>
                    <LiveHeader
                        userId={data.owner.userId}
                        name={data.owner.name}
                        iconURL={data.owner.iconURL}
                        isOwner={true}
                        isPlaying={false}
                    />
                    <Container maxWidth="md" sx={{ mt: 3 }}>
                        <Stack spacing={3}>
                            <OwnerIdleGuide
                                liveUrl={liveUrl}
                                onCopyLiveUrl={handleCopyLiveUrl}
                            />
                            <PlayForm
                                embedded
                                afterCreate={{
                                    action: "stay",
                                    cb: handleAfterCreate,
                                }}
                            />
                        </Stack>
                    </Container>
                    <CopyStatusSnackbar
                        status={liveCopyStatus}
                        onClose={clearLiveCopyStatus}
                        successMessage="あなたの部屋リンクをコピーしました。"
                    />
                </>
            );
        }
        return (
            <>
                <LiveHeader
                    userId={data.owner.userId}
                    name={data.owner.name}
                    iconURL={data.owner.iconURL}
                    isOwner={false}
                    isPlaying={false}
                    width="narrow"
                />
                <Container maxWidth="sm" sx={{ mt: 4 }}>
                    <Card>
                        <CardContent>
                            <Stack
                                spacing={2}
                                sx={{ alignItems: "center", py: 2 }}
                            >
                                <Typography variant="h6">
                                    {data.owner.name}{" "}
                                    さんは現在ゲームを起動していません
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="textSecondary"
                                    sx={{ textAlign: "center" }}
                                >
                                    ゲーム開始までお待ちください。
                                </Typography>
                            </Stack>
                        </CardContent>
                    </Card>
                </Container>
            </>
        );
    }
    return (
        <>
            <LiveHeader
                userId={data.owner.userId}
                name={data.owner.name}
                iconURL={data.owner.iconURL}
                isOwner={data.isGameMaster}
                isPlaying={true}
            />
            <PlayView
                key={liveInfo.id}
                playId={`${liveInfo.id}`}
                playToken={liveInfo.playToken}
                playerId={liveInfo.playerId}
                playName={liveInfo.playName}
                isLimited={liveInfo.isLimited}
                requireSignIn={liveInfo.requireSignIn}
                chatEnabled={liveInfo.chatEnabled}
                joinWord={liveInfo.joinWord}
                inviteHash={liveInfo.inviteHash}
                game={liveInfo.game}
                gameMaster={liveInfo.gameMaster}
                isGameMaster={data.isGameMaster}
                contentWidth={liveInfo.width}
                contentHeight={liveInfo.height}
                contentExternal={liveInfo.external}
                createdAt={liveInfo.createdAt}
                remainingMs={liveInfo.remainingMs}
                expiresAt={liveInfo.expiresAt}
                user={user}
                onPlayEnd={handleAfterPlayClose}
                afterPlayClose={{ action: "stay", cb: handleAfterPlayClose }}
                afterRecreate={{ action: "stay", cb: handleAfterCreate }}
                pageType="live"
                ref={container}
            />
        </>
    );
}
