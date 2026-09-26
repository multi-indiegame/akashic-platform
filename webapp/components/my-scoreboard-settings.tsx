"use client";

import { useState } from "react";
import {
    Alert,
    Button,
    Card,
    CardContent,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    Stack,
    Switch,
    Typography,
} from "@mui/material";
import {
    Launch,
    Share,
    X,
    Visibility,
    VisibilityOff,
} from "@mui/icons-material";
import {
    resumeScoreboardPublication,
    revokeScoreboardPublication,
    setScoreboardPublic,
} from "@/lib/server/scoreboard-share-action";
import { postUserStatsToX, shareUserStats } from "@/lib/client/share-stats";

export function MyScoreboardSettings({
    userId,
    userName,
    initialPublic,
    initialOptOut,
}: {
    userId: string;
    userName: string;
    initialPublic: boolean;
    initialOptOut: boolean;
}) {
    const [isPublic, setIsPublic] = useState(initialPublic);
    const [optOut, setOptOut] = useState(initialOptOut);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [message, setMessage] = useState<{
        severity: "success" | "error" | "info";
        text: string;
    }>();

    async function handleToggle(next: boolean) {
        setIsPublic(next);
        const res = await setScoreboardPublic(next);
        if (!res.ok) {
            setIsPublic(!next);
            setMessage({
                severity: "error",
                text: "設定を変更できませんでした。",
            });
        }
    }

    async function handleRevoke() {
        setConfirmOpen(false);
        const res = await revokeScoreboardPublication();
        setMessage(
            res.ok
                ? {
                      severity: "info",
                      text: "統計への掲載をやめました。これから遊ぶ分も掲載されません。",
                  }
                : {
                      severity: "error",
                      text: "設定を変更できませんでした。",
                  },
        );
        if (res.ok) {
            setIsPublic(false);
            setOptOut(true);
        }
    }

    async function handleResume() {
        const res = await resumeScoreboardPublication();
        setMessage(
            res.ok
                ? {
                      severity: "success",
                      text: "掲載を再開しました。これから遊ぶ分が統計に表示されます。",
                  }
                : {
                      severity: "error",
                      text: "設定を変更できませんでした。",
                  },
        );
        if (res.ok) {
            setOptOut(false);
        }
    }

    return (
        <Card variant="outlined">
            <CardContent>
                <Stack spacing={2}>
                    {optOut ? (
                        <>
                            <Alert variant="outlined" severity="info">
                                統計に掲載しない設定です。ゲーム内で名前を使って参加しても、ランキングや称号には表示されません。
                            </Alert>
                            <Button
                                startIcon={<Visibility />}
                                variant="contained"
                                onClick={handleResume}
                                sx={{ alignSelf: "flex-start" }}
                            >
                                掲載を再開する
                            </Button>
                            <Typography variant="caption" color="textSecondary">
                                再開すると、これから遊ぶ分が記録に残ります。
                            </Typography>
                        </>
                    ) : (
                        <>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={isPublic}
                                        onChange={(e) =>
                                            handleToggle(e.target.checked)
                                        }
                                    />
                                }
                                label="自分の記録を共有ページとして公開する"
                            />
                            {isPublic && (
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{
                                        alignItems: "center",
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <Button
                                        size="small"
                                        component="a"
                                        href={`/user/${userId}/stats`}
                                        // WHY: 設定を触っている最中に画面を奪わない
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        endIcon={<Launch fontSize="small" />}
                                    >
                                        公開ページを開く
                                    </Button>
                                    <Button
                                        size="small"
                                        startIcon={<Share fontSize="small" />}
                                        onClick={async () => {
                                            const res = await shareUserStats({
                                                userId,
                                                name: userName,
                                            });
                                            if (res) {
                                                setMessage({
                                                    severity: res.severity,
                                                    text: res.message,
                                                });
                                            }
                                        }}
                                    >
                                        共有する
                                    </Button>
                                    <Button
                                        size="small"
                                        startIcon={<X fontSize="small" />}
                                        onClick={() =>
                                            postUserStatsToX({
                                                userId,
                                                name: userName,
                                            })
                                        }
                                    >
                                        シェア
                                    </Button>
                                </Stack>
                            )}
                            <Button
                                startIcon={<VisibilityOff />}
                                color="error"
                                variant="outlined"
                                onClick={() => setConfirmOpen(true)}
                                sx={{ alignSelf: "flex-start" }}
                            >
                                統計への掲載をやめる
                            </Button>
                        </>
                    )}
                    {message && (
                        <Alert variant="outlined" severity={message.severity}>
                            {message.text}
                        </Alert>
                    )}
                </Stack>
            </CardContent>
            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>統計への掲載をやめますか</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        ランキングから名前が表示されなくなり、獲得した称号もなくなります。
                        <strong>これから遊ぶ分も掲載されません</strong>
                        。掲載はいつでも再開できますが、
                        <strong>いちど消えた記録は元に戻せません</strong>。
                    </DialogContentText>
                    <DialogActions>
                        <Button
                            variant="outlined"
                            color="inherit"
                            onClick={() => setConfirmOpen(false)}
                        >
                            キャンセル
                        </Button>
                        <Button
                            variant="contained"
                            color="error"
                            onClick={handleRevoke}
                        >
                            掲載をやめる
                        </Button>
                    </DialogActions>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
