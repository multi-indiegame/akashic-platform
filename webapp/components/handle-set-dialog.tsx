"use client";

import { useTransition, useState } from "react";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography,
} from "@mui/material";
import { AlternateEmail } from "@mui/icons-material";
import { updateUserHandle } from "@/lib/server/user";

export function HandleSetDialog({
    open,
    onClose,
    onHandleSet,
}: {
    open: boolean;
    onClose: () => void;
    onHandleSet: (handle: string) => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string>();
    const [handle, setHandle] = useState("");

    function handleSubmit() {
        startTransition(async () => {
            const res = await updateUserHandle(handle);
            if (res.ok) {
                onHandleSet(res.handle);
                onClose();
            } else {
                switch (res.reason) {
                    case "Unauthorized":
                        setError(
                            "あなたの部屋IDの設定にはサインインが必要です。",
                        );
                        break;
                    case "EmptyHandle":
                        setError("あなたの部屋IDを入力してください。");
                        break;
                    case "InvalidFormatHandle":
                        setError(
                            "あなたの部屋IDは2〜20文字の英小文字・数字・アンダースコア・ハイフンで入力してください。先頭は英数字にしてください。",
                        );
                        break;
                    case "ForbiddenHandle":
                        setError("その部屋IDは使用できません。");
                        break;
                    case "HandleAlreadyExists":
                        setError("その部屋IDはすでに使用されています。");
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

    function handleClose() {
        setHandle("");
        setError(undefined);
        onClose();
    }

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <DialogTitle>あなたの部屋IDを設定</DialogTitle>
            <DialogContent>
                <Typography
                    variant="body2"
                    color="textSecondary"
                    sx={{ mb: 2 }}
                >
                    あなたの部屋IDを設定すると{" "}
                    <strong>/live/[あなたの部屋ID]</strong>{" "}
                    というURLから、いつでもあなたが作成した最新の部屋に案内できます。
                </Typography>
                <TextField
                    label="あなたの部屋ID"
                    name="handle"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="例: user12345"
                    helperText="2〜20文字の英小文字・数字・ _ ・ - が使えます。先頭は英数字にしてください。"
                    fullWidth
                    autoFocus
                    slotProps={{ htmlInput: { maxLength: 20 } }}
                />
                {error && (
                    <Alert severity="error" variant="outlined" sx={{ mt: 1 }}>
                        {error}
                    </Alert>
                )}
                <DialogActions>
                    <Button
                        variant="outlined"
                        color="inherit"
                        disabled={isPending}
                        onClick={handleClose}
                    >
                        キャンセル
                    </Button>
                    <Button
                        startIcon={<AlternateEmail />}
                        type="submit"
                        variant="contained"
                        loading={isPending}
                        disabled={isPending}
                        onClick={handleSubmit}
                    >
                        設定する
                    </Button>
                </DialogActions>
            </DialogContent>
        </Dialog>
    );
}
