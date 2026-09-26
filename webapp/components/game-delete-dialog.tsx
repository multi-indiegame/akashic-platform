"use client";

import { useTransition, useState } from "react";
import { redirect } from "next/navigation";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from "@mui/material";
import { Delete } from "@mui/icons-material";
import { deleteGame } from "@/lib/server/content-delete";
import { messageKey, messages } from "@/lib/types";

export function GameDeleteDialog({ gameId }: { gameId: number }) {
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string>();

    function handleSubmit() {
        startTransition(async () => {
            const res = await deleteGame({ gameId });
            if (res.ok) {
                redirect(
                    `/?${messageKey}=${messages.content.deleteSuccessful}`,
                );
            } else {
                switch (res.reason) {
                    case "InvalidParams":
                        setError(
                            "内部エラーが発生しました。入力内容を確認してもう一度実行してください。",
                        );
                        break;
                    case "Unauthorized":
                        setError(
                            "サインインの有効期限が切れました。ページを更新してサインインし直してください。",
                        );
                        break;
                    case "NotFound":
                        setError("このゲームが見つかりませんでした。");
                        break;
                    case "Drain":
                        setError(
                            "現在臨時メンテナンス中のため、コンテンツを削除できません。1時間ほど時間をおいてください。",
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

    function handleClick() {
        setOpen(true);
    }

    function handleClose() {
        setOpen(false);
    }

    return (
        <>
            <Button
                startIcon={<Delete />}
                variant="outlined"
                color="error"
                onClick={handleClick}
            >
                ゲームを削除する
            </Button>
            <Dialog
                open={open}
                onClose={handleClose}
                aria-labelledby="dialog-title"
                aria-describedby="dialog-description"
            >
                <DialogTitle id="dialog-title">
                    このゲームを削除しますか？
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="dialog-description">
                        投稿したゲームと関連するデータが削除されます。削除後は復元できません。
                    </DialogContentText>
                    {error && (
                        <Alert
                            variant="outlined"
                            severity="error"
                            sx={{ mt: 1 }}
                        >
                            {error}
                        </Alert>
                    )}
                    <DialogActions>
                        <Button
                            variant="contained"
                            color="error"
                            loading={isPending}
                            disabled={isPending}
                            onClick={handleSubmit}
                        >
                            削除する
                        </Button>
                        <Button
                            variant="outlined"
                            color="inherit"
                            loading={isPending}
                            disabled={isPending}
                            onClick={handleClose}
                        >
                            キャンセル
                        </Button>
                    </DialogActions>
                </DialogContent>
            </Dialog>
        </>
    );
}
