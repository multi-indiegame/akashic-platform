"use client";

import { useEffect, useState } from "react";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from "@mui/material";

/**
 * 次の要求に切り替わった直後に操作を受け付けない時間。
 * 確認待ちが続くと同じ位置に同じボタンが出るため、ダブルクリックや Enter の
 * 連打で次の相手まで確認なしに BAN してしまうのを防ぐ
 */
const ARM_DELAY_MS = 500;

export interface BanConfirmRequest {
    id: number;
    /** サーバーが解決した表示名。コンテンツから渡された名前は使わない */
    label: string;
}

/**
 * ゲームが視聴者のBANを要求するたびに、部屋主へ出す確認。
 * コンテンツは webapp と同一オリジンで動くためこのダイアログは迂回できる。
 * 事故防止と可視化のためのもので、実効的な制限はサーバー側に置いている。
 */
export function PlayBanConfirmDialog({
    request,
    allRooms,
    queued,
    onConfirm,
    onCancel,
}: {
    request: BanConfirmRequest | undefined;
    /** サインイン部屋主の BAN は自分の全部屋に効く */
    allRooms: boolean;
    /** 表示中の要求の後ろで確認を待っている件数 */
    queued: number;
    onConfirm: (id: number) => void;
    onCancel: (id: number) => void;
}) {
    // 閉じるアニメーションの間も直前の相手を表示し続ける
    const [shown, setShown] = useState(request);
    if (request && request !== shown) {
        setShown(request);
    }
    const [armedId, setArmedId] = useState<number>();
    useEffect(() => {
        if (!request) {
            return;
        }
        const timer = setTimeout(() => setArmedId(request.id), ARM_DELAY_MS);
        return () => clearTimeout(timer);
    }, [request]);
    const armed = !!request && armedId === request.id;

    const cancel = () => {
        if (armed) {
            onCancel(request.id);
        }
    };

    return (
        <Dialog
            open={!!request}
            onClose={cancel}
            aria-labelledby="ban-confirm-dialog-title"
            aria-describedby="ban-confirm-dialog-description"
        >
            <DialogTitle
                id="ban-confirm-dialog-title"
                sx={{ overflowWrap: "anywhere" }}
            >
                {shown?.label} さんをBANしますか？
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="ban-confirm-dialog-description">
                    ゲームが、参加者をBANする操作を要求しています。BANした相手はこの部屋から退室させられ、再び入室できなくなります。
                </DialogContentText>
                {allRooms && (
                    <Alert variant="outlined" severity="warning" sx={{ mt: 1 }}>
                        BANした相手は、この部屋だけでなくあなたの全ての部屋に入室できなくなります。解除はモデレーション設定から行えます。
                    </Alert>
                )}
                {queued > 0 && (
                    <DialogContentText variant="body2" sx={{ mt: 1 }}>
                        ほかに {queued} 件のBAN要求が確認を待っています。
                    </DialogContentText>
                )}
                <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
                    <Button
                        variant="contained"
                        color="error"
                        disabled={!armed}
                        onClick={() => {
                            if (armed) {
                                onConfirm(request.id);
                            }
                        }}
                    >
                        BANする
                    </Button>
                    <Button
                        variant="outlined"
                        color="inherit"
                        disabled={!armed}
                        onClick={cancel}
                    >
                        キャンセル
                    </Button>
                </DialogActions>
            </DialogContent>
        </Dialog>
    );
}
