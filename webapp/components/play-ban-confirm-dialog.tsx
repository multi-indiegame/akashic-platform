"use client";

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
 * ゲームが視聴者のBANを要求するたびに、部屋主へ出す確認。
 * コンテンツは webapp と同一オリジンで動くためこのダイアログは迂回できる。
 * 事故防止と可視化のためのもので、実効的な制限はサーバー側に置いている。
 */
export function PlayBanConfirmDialog({
    open,
    allRooms,
    queued,
    onConfirm,
    onCancel,
}: {
    open: boolean;
    /** サインイン部屋主の BAN は自分の全部屋に効く */
    allRooms: boolean;
    /** 表示中の要求の後ろで確認を待っている件数 */
    queued: number;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Dialog
            open={open}
            onClose={onCancel}
            aria-labelledby="ban-confirm-dialog-title"
            aria-describedby="ban-confirm-dialog-description"
        >
            <DialogTitle id="ban-confirm-dialog-title">
                本当に参加者をBANしますか？
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
                        onClick={onConfirm}
                    >
                        BANする
                    </Button>
                    <Button
                        variant="outlined"
                        color="inherit"
                        onClick={onCancel}
                    >
                        キャンセル
                    </Button>
                </DialogActions>
            </DialogContent>
        </Dialog>
    );
}
