"use client";

import { useState } from "react";
import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
} from "@mui/material";
import { Close, Login } from "@mui/icons-material";
import { SignIn } from "./sign-in";

export function SignInDialog({
    trigger = { action: "self" },
}: {
    // action:"self"       … 自前のサインインボタンを表示し内部で開閉する
    // action:"controlled" … 開閉を外部に委ねる（トリガーを Menu の外へ出す用途）
    trigger?:
        | { action: "self" }
        | { action: "controlled"; open: boolean; onClose: () => void };
} = {}) {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = trigger.action === "controlled" ? trigger.open : internalOpen;

    function handleClick() {
        setInternalOpen(true);
    }
    function handleClose() {
        if (trigger.action === "controlled") {
            trigger.onClose();
        } else {
            setInternalOpen(false);
        }
    }
    return (
        <>
            {trigger.action === "self" && (
                <Button
                    startIcon={<Login />}
                    variant="contained"
                    onClick={handleClick}
                >
                    サインイン
                </Button>
            )}
            <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
                <DialogTitle
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                    }}
                >
                    サインイン
                    <IconButton aria-label="close" onClick={handleClose}>
                        <Close />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ pb: 3 }}>
                    <SignIn size="medium" />
                </DialogContent>
            </Dialog>
        </>
    );
}
