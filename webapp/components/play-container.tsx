"use client";

import { useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
    Alert,
    Button,
    Card,
    CardContent,
    Container,
    Skeleton,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { MeetingRoom } from "@mui/icons-material";
import { usePlay } from "@/lib/client/usePlay";
import { useAuth } from "@/lib/client/useAuth";
import { PlayView } from "@/components/play-view";
import { ClosedPlayView } from "@/components/play-view-closed";
import { SignInAlert } from "@/components/sign-in-alert";

export function PlayContainer() {
    const { id } = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const inviteHash = searchParams.get("inviteHash") ?? undefined;
    const [joinWord, setJoinWord] = useState("");
    const [submittedJoinWord, setSubmittedJoinWord] = useState<string>();
    const { isLoading, data, error, requiresJoinWord, requiresSignIn, banned } =
        usePlay(id, inviteHash, submittedJoinWord);
    const [user] = useAuth();
    const container = useRef<HTMLDivElement>(null);

    function handleSubmitJoinWord(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSubmittedJoinWord(joinWord);
    }

    if (isLoading) {
        return (
            <Container>
                <Skeleton variant="rectangular" />
            </Container>
        );
    }
    if (requiresSignIn) {
        return (
            <SignInAlert message="この部屋はサインインしたユーザーのみ参加できます。" />
        );
    }
    if (banned) {
        return (
            <Container maxWidth="md" sx={{ mt: 2 }}>
                <Alert variant="outlined" severity="error">
                    あなたはこの部屋に入室できません。
                </Alert>
            </Container>
        );
    }
    if (requiresJoinWord) {
        return (
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
                            <Typography variant="h6">
                                この部屋は限定公開です
                            </Typography>
                            <Typography variant="body2">
                                部屋一覧から入る場合は、部屋主が設定した入室の言葉が必要です。
                            </Typography>
                            <TextField
                                label="入室の言葉"
                                value={joinWord}
                                onChange={(event) =>
                                    setJoinWord(event.target.value)
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
        );
    }
    if (error || !data || !user) {
        return (
            <Container maxWidth="md" sx={{ mt: 2 }}>
                <Alert variant="outlined" severity="error">
                    {error ??
                        "予期しないエラーが発生しました。画面を更新してください。"}
                </Alert>
            </Container>
        );
    }
    if (!data.isActive) {
        return (
            <ClosedPlayView
                playName={data.playName}
                isLimited={data.isLimited}
                requireSignIn={data.requireSignIn}
                chatEnabled={data.chatEnabled}
                createdAt={data.createdAt}
                endedAt={data.endedAt}
                gameMaster={data.gameMaster}
                game={data.game}
                user={user ?? null}
            />
        );
    }
    return (
        <PlayView
            playId={id}
            playToken={data.playToken}
            playerId={data.playerId}
            playName={data.playName}
            isLimited={data.isLimited}
            requireSignIn={data.requireSignIn}
            chatEnabled={data.chatEnabled}
            joinWord={data.joinWord}
            inviteHash={data.inviteHash}
            isGameMaster={data.isGameMaster}
            contentWidth={data.width}
            contentHeight={data.height}
            contentExternal={data.external}
            createdAt={data.createdAt}
            remainingMs={data.remainingMs}
            expiresAt={data.expiresAt}
            gameMaster={data.gameMaster}
            game={data.game}
            user={user}
            afterPlayClose={{ action: "redirect" }}
            afterRecreate={{ action: "navigate" }}
            pageType="play"
            ref={container}
        />
    );
}
