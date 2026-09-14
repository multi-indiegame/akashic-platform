"use client";

import { useTransition, useState } from "react";
import { redirect, useRouter } from "next/navigation";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from "@mui/material";
import { GameInfo, messageKey, messages, User } from "@/lib/types";
import { endPlayAction } from "@/lib/server/play-end-action";
import { PlayCreateDialog } from "./play-create-dialog";

export function PlayCloseDialog({
    playId,
    afterClose,
    recreate,
}: {
    playId: string;
    afterClose: { action: "redirect" } | { action: "stay"; cb: () => void };
    recreate: {
        game: GameInfo;
        user: User | null;
        initialValues: {
            playName: string | null;
            isLimited: boolean;
            joinWord?: string;
            requireSignIn: boolean;
            chatEnabled: boolean;
        };
        afterCreate:
            { action: "navigate" } | { action: "stay"; cb: () => void };
    };
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [recreateOpen, setRecreateOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string>();

    function doAfterClose() {
        switch (afterClose.action) {
            case "redirect":
                redirect(`/?${messageKey}=${messages.play.endSuccessful}`);
            case "stay":
                afterClose.cb();
                break;
            default:
                console.error("invalide afterClose action type.", afterClose);
                break;
        }
    }

    // NOTE: 作ってから閉じる。先に閉じると、live ではポーリング再描画でこのダイアログごとアンマウントされてしまうから。
    function handleRecreate() {
        setError(undefined);
        // aria-hidden 警告防止のため
        if (typeof document !== "undefined") {
            (document.activeElement as HTMLElement | null)?.blur?.();
        }
        setOpen(false);
        setRecreateOpen(true);
    }

    function handleEnd() {
        startTransition(async () => {
            const res = await endPlayAction({ playId });
            if (res.ok) {
                doAfterClose();
            } else {
                switch (res.reason) {
                    case "InvalidParams":
                        setError(
                            "内部エラーが発生しました。入力内容を確認してもう一度投稿してください。",
                        );
                        break;
                    case "NotFound":
                        setError("部屋が見つかりませんでした。");
                        break;
                    case "Forbidden":
                        setError(
                            "部屋主のみが部屋を閉じられます。サインインの有効期限が切れた場合はページを更新してください。",
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
                variant="outlined"
                color="error"
                onClick={handleClick}
                sx={{ margin: "auto" }}
            >
                部屋を閉じる
            </Button>
            <Dialog
                open={open}
                onClose={handleClose}
                aria-labelledby="dialog-title"
                aria-describedby="dialog-description"
            >
                <DialogTitle id="dialog-title">部屋を閉じますか？</DialogTitle>
                <DialogContent>
                    <DialogContentText id="dialog-description">
                        現在遊んでいるゲームを終了します。この部屋に参加しているプレイヤーはこれ以上遊べなくなります。続けて遊ぶ場合は「作り直す」を選ぶと、同じ設定で新しい部屋を作成できます。
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
                    <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
                        <Button
                            variant="contained"
                            color="error"
                            loading={isPending}
                            disabled={isPending}
                            onClick={handleEnd}
                        >
                            終了する
                        </Button>
                        <Button
                            variant="outlined"
                            color="error"
                            disabled={isPending}
                            onClick={handleRecreate}
                        >
                            作り直す
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
            <PlayCreateDialog
                open={recreateOpen}
                onClose={() => {
                    setRecreateOpen(false);
                }}
                game={recreate.game}
                user={recreate.user}
                initialValues={recreate.initialValues}
                afterCreate={{
                    action: "stay",
                    cb: async ({ playId: newPlayId }) => {
                        await endPlayAction({ playId });
                        if (recreate.afterCreate.action === "stay") {
                            setRecreateOpen(false);
                            recreate.afterCreate.cb();
                        } else {
                            router.push(
                                `/play/${newPlayId}?${messageKey}=${messages.play.registerSuccessful}`,
                            );
                        }
                    },
                }}
            />
        </>
    );
}
