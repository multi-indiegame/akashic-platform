"use client";

import { useEffect, useState } from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextField,
} from "@mui/material";
import { ResolvingPlayerInfoRequest } from "@/lib/client/akashic-plugins/coe-limited-plugin";
import { useAuth } from "@/lib/client/useAuth";
import { STORAGE_KEYS, useLocalStorage } from "@/lib/client/useLocalStorage";

function StatsNotice() {
    return (
        <DialogContentText variant="body2" sx={{ mt: 1 }}>
            名前で参加すると、参加者名がこのゲームの統計ページに掲載されることがあります。
            匿名で参加した場合は掲載されません。
        </DialogContentText>
    );
}

export function PlayPlayerInfoResolver({
    request,
    requireSignIn,
    hasScoreboard,
}: {
    request: ResolvingPlayerInfoRequest;
    requireSignIn: boolean;
    hasScoreboard: boolean;
}) {
    const [user] = useAuth();
    const [remainingSeconds, setRemainingSeconds] = useState(
        request.limitSeconds,
    );
    const [open, setOpen] = useState(true);
    const [guestName, setGuestName] = useLocalStorage(
        STORAGE_KEYS.PLAYER_INFO_NAME,
        "",
    );

    function handleDeny() {
        request.onResolve(false, request.guestName);
        setOpen(false);
    }

    function handleAccept() {
        let resolvedName = request.guestName;
        if (user?.authType === "oauth") {
            resolvedName = user.name;
        } else if (user?.authType === "guest" && guestName) {
            resolvedName = guestName;
            setGuestName(guestName, true);
        }
        request.onResolve(true, resolvedName);
        setOpen(false);
    }

    useEffect(() => {
        const intervalId = setInterval(() => {
            setRemainingSeconds((current) => {
                const next = current - 1;
                if (next <= 0) {
                    clearInterval(intervalId);
                    // サインイン必須部屋は匿名参加禁止
                    if (requireSignIn) {
                        handleAccept();
                    } else {
                        handleDeny();
                    }
                    return 0;
                } else {
                    return next;
                }
            });
        }, 1000);
        return () => {
            clearInterval(intervalId);
        };
    }, []);

    return (
        <Dialog
            open={open}
            aria-labelledby="dialog-title"
            aria-describedby="dialog-description"
        >
            <DialogTitle id="dialog-title">
                このゲームは名前を使用します
            </DialogTitle>
            {requireSignIn && user?.authType === "oauth" ? (
                <DialogContent>
                    <DialogContentText id="dialog-description">
                        この部屋はサインイン必須のため、ユーザー名「{user.name}
                        」で参加します。 (残り
                        {remainingSeconds}秒)
                        ※未選択の場合もユーザー名で参加します。
                    </DialogContentText>
                    {hasScoreboard && <StatsNotice />}
                    <DialogActions>
                        <Button
                            variant="contained"
                            onClick={handleAccept}
                            sx={{
                                textTransform: "none",
                            }}
                        >
                            ユーザー名 ({user.name}) で参加
                        </Button>
                    </DialogActions>
                </DialogContent>
            ) : user ? (
                <DialogContent>
                    <DialogContentText id="dialog-description">
                        {user.authType === "guest"
                            ? "ユーザー名を入力して参加するか、匿名で参加するか選択してください。"
                            : "ユーザー名で参加するか、匿名で参加するか選択してください。"}
                        (残り
                        {remainingSeconds}秒) ※未選択の場合は匿名で参加します。
                    </DialogContentText>
                    {hasScoreboard && <StatsNotice />}
                    {user.authType === "guest" && (
                        <TextField
                            autoFocus
                            fullWidth
                            margin="dense"
                            label="ユーザー名"
                            value={guestName}
                            onChange={(event) =>
                                setGuestName(event.target.value, false)
                            }
                            slotProps={{
                                htmlInput: {
                                    maxLength: 16,
                                },
                            }}
                        />
                    )}
                    <DialogActions>
                        <Button
                            variant="contained"
                            onClick={handleAccept}
                            sx={{
                                textTransform: "none",
                            }}
                            disabled={user.authType === "guest" && !guestName}
                        >
                            {user.authType === "guest"
                                ? "入力した名前で参加"
                                : `ユーザー名 (${user.name})`}
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleDeny}
                            sx={{
                                textTransform: "none",
                            }}
                        >
                            匿名 ({request.guestName})
                        </Button>
                    </DialogActions>
                </DialogContent>
            ) : (
                <DialogContent>
                    <DialogContentText id="dialog-description">
                        匿名で参加します。 (残り
                        {remainingSeconds}秒)
                        ※サインインするとユーザー名で参加できます。
                    </DialogContentText>
                    <DialogActions>
                        <Button
                            variant="contained"
                            onClick={handleDeny}
                            sx={{
                                textTransform: "none",
                            }}
                        >
                            匿名 ({request.guestName})
                        </Button>
                    </DialogActions>
                </DialogContent>
            )}
        </Dialog>
    );
}
