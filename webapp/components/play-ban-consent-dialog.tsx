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
 * ゲームが視聴者のBANを要求したときに、部屋主へ最初の 1 回だけ出す確認。
 * コンテンツは webapp と同一オリジンで動くためこのダイアログは迂回できる。
 * 事故防止と可視化のためのもので、実効的な制限はサーバー側に置いている。
 */
export function PlayBanConsentDialog({
    open,
    allRooms,
    onAllow,
    onReject,
}: {
    open: boolean;
    /** サインイン部屋主の BAN は自分の全部屋に効く */
    allRooms: boolean;
    onAllow: () => void;
    onReject: () => void;
}) {
    return (
        <Dialog
            open={open}
            onClose={onReject}
            aria-labelledby="ban-consent-dialog-title"
            aria-describedby="ban-consent-dialog-description"
        >
            <DialogTitle id="ban-consent-dialog-title">
                本当に参加者をBANしますか？
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="ban-consent-dialog-description">
                    このゲームは、視聴者をゲームの進行からBANする操作を行います。許可すると、この部屋では以後のBAN操作を確認なしで実行します。
                </DialogContentText>
                {allRooms && (
                    <Alert variant="outlined" severity="warning" sx={{ mt: 1 }}>
                        BANした相手は、この部屋だけでなくあなたの全ての部屋に入室できなくなります。解除はモデレーション設定から行えます。
                    </Alert>
                )}
                <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
                    <Button variant="contained" onClick={onAllow}>
                        許可する
                    </Button>
                    <Button
                        variant="outlined"
                        color="inherit"
                        onClick={onReject}
                    >
                        許可しない
                    </Button>
                </DialogActions>
            </DialogContent>
        </Dialog>
    );
}
