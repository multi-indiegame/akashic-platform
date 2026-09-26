"use client";

import { useState } from "react";
import Link from "next/link";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from "@mui/material";
import { ExitToApp } from "@mui/icons-material";
import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";

export function PlayEndNotification({ reason }: { reason: PlayEndReason }) {
    const [open, setOpen] = useState(true);

    function toMessage(reason: PlayEndReason) {
        switch (reason) {
            case "GAMEMASTER":
                return "部屋主がゲームを終了しました。";
            case "TIMEOUT":
                return "プレイ可能な最大時間を過ぎたため、強制終了しました。";
            case "IDLE":
                return "一定期間遊ぶ人がいなかったため、自動で終了しました。";
            case "DEL_CONTENT":
                return "ゲームが削除されたため、強制終了しました。";
            case "INTERNAL_ERROR":
            default:
                return "不明なエラーが発生したため、強制終了しました。";
        }
    }

    function handleClose(ev: Event, reason?: string) {
        if (!reason) {
            setOpen(false);
        }
    }

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            aria-labelledby="dialog-title"
            aria-describedby="dialog-description"
        >
            <DialogTitle id="dialog-title">ゲームが終了しました</DialogTitle>
            <DialogContent>
                <DialogContentText id="dialog-description">
                    {toMessage(reason)}
                </DialogContentText>
                <DialogActions>
                    <Button
                        startIcon={<ExitToApp />}
                        variant="contained"
                        component={Link}
                        href="/"
                    >
                        退出する
                    </Button>
                </DialogActions>
            </DialogContent>
        </Dialog>
    );
}
