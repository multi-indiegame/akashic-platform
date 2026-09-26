"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Radio,
    RadioGroup,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import { GameInfo, messageKey, messages, User } from "@/lib/types";
import { registerPlay } from "@/lib/server/play-register";
import { STORAGE_KEYS, useLocalStorage } from "@/lib/client/useLocalStorage";

export function PlayCreateDialog({
    open,
    onClose,
    game,
    user,
    initialValues,
    afterCreate,
}: {
    open: boolean;
    onClose: () => void;
    game?: GameInfo;
    user: User | null;
    initialValues?: {
        playName: string | null;
        isLimited: boolean;
        joinWord?: string;
        requireSignIn: boolean;
        chatEnabled: boolean;
    };
    afterCreate:
        | { action: "navigate" }
        | {
              action: "stay";
              cb: (created: { playId: number; inviteHash?: string }) => void;
          };
}) {
    const router = useRouter();
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
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string>();

    useEffect(() => {
        if (open) {
            if (initialValues) {
                setPlayName(initialValues.playName ?? "");
                setIsLimited(initialValues.isLimited);
                setJoinWord(initialValues.joinWord ?? "");
                setRequireSignIn(initialValues.requireSignIn);
                setChatEnabled(initialValues.chatEnabled);
            }
            setError(undefined);
            setSending(false);
        }
        // initialValues は毎レンダーで新しい参照になるため依存に含めない
    }, [open, game?.contentId]);

    async function handleSubmit() {
        if (!game) {
            setError("ゲームが見つかりません。");
            return;
        }
        if (!user) {
            setError("サインインしてください。");
            return;
        }
        if (isLimited && !joinWord) {
            setError("限定部屋を作成する場合、入室の言葉が必要です。");
            return;
        }
        setSending(true);
        const res = await registerPlay({
            contentId: game.contentId,
            playName,
            isLimited,
            joinWord,
            requireSignIn: canRequireSignIn && requireSignIn,
            chatEnabled,
        });
        if (res.ok) {
            switch (afterCreate.action) {
                case "navigate":
                    router.push(
                        `/play/${res.playId}?${messageKey}=${messages.play.registerSuccessful}`,
                    );
                    break;
                case "stay":
                    afterCreate.cb({
                        playId: res.playId,
                        inviteHash: res.inviteHash,
                    });
                    break;
                default:
                    console.error(
                        "invalid afterCreate action type",
                        afterCreate,
                    );
                    break;
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
                        "ゲスト状態が作成できる部屋数の上限に達しました。",
                    );
                    break;
                case "InternalError":
                default:
                    setError(
                        "予期しないエラーが発生しました。時間をおいてリトライしてください。",
                    );
                    break;
            }
            setSending(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>部屋を作成する</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                        label="部屋名"
                        placeholder={`例）「${game?.title ?? "〇〇ゲーム"}」で遊ぼう！`}
                        value={playName}
                        onChange={(event) => setPlayName(event.target.value)}
                        fullWidth
                        slotProps={{
                            htmlInput: {
                                maxLength: 100,
                            },
                        }}
                        helperText="最大 100 文字"
                    />
                    <Stack spacing={1}>
                        <Typography variant="subtitle1">公開設定</Typography>
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
                    </Stack>
                    {isLimited && (
                        <TextField
                            label="入室の言葉"
                            value={joinWord}
                            onChange={(event) =>
                                setJoinWord(event.target.value)
                            }
                            fullWidth
                            slotProps={{
                                htmlInput: {
                                    maxLength: 100,
                                },
                            }}
                            helperText="部屋一覧から入室するときに必要な言葉です。"
                        />
                    )}
                    <Stack spacing={0.5}>
                        <Typography variant="subtitle1">参加者設定</Typography>
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
                    </Stack>
                    <Stack spacing={0.5}>
                        <Typography variant="subtitle1">
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
                    </Stack>
                    {error && (
                        <Alert variant="outlined" severity="error">
                            {error}
                        </Alert>
                    )}
                </Stack>
                <DialogActions>
                    <Button
                        startIcon={<Add />}
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={sending}
                    >
                        作成する
                    </Button>
                    <Button
                        variant="outlined"
                        color="inherit"
                        onClick={onClose}
                        disabled={sending}
                    >
                        キャンセル
                    </Button>
                </DialogActions>
            </DialogContent>
        </Dialog>
    );
}
