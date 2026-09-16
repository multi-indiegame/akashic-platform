"use client";

import { useEffect, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Typography,
} from "@mui/material";

/**
 * 次の要求に切り替わった直後に操作を受け付けない時間。
 * 確認待ちが続くと同じ位置に同じボタンが出るため、ダブルクリックや Enter の
 * 連打で次の相手まで確認なしに BAN してしまうのを防ぐ
 */
const ARM_DELAY_MS = 500;

const TARGET_NAME_DISPLAY_MAX = 32;

export interface BanConfirmRequest {
    id: number;
    /**
     * ゲームが申告した対象の表示名。実行基盤は検証していないため、表示の補助にだけ使う。
     * 申告が無いときにアカウント名で補うと、確認を出しては取りやめるだけで
     * 同意なく名前を知れてしまうので、補わずに undefined のままにする
     */
    name?: string;
}

/**
 * ゲームから来る信頼できない値なので、改行や双方向制御文字でダイアログの
 * 文言に見せかけられないよう取り除き、長すぎる名前でレイアウトが崩れないよう切り詰める
 */
function toDisplayName(name: string | undefined) {
    if (!name) {
        return undefined;
    }
    const cleaned = name
        .replace(
            /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028-\u202E\u2066-\u2069]/g,
            "",
        )
        .trim();
    if (!cleaned) {
        return undefined;
    }
    const chars = Array.from(cleaned);
    return chars.length > TARGET_NAME_DISPLAY_MAX
        ? `${chars.slice(0, TARGET_NAME_DISPLAY_MAX).join("")}…`
        : cleaned;
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
    const [armedId, setArmedId] = useState<number>();
    useEffect(() => {
        if (!request) {
            return;
        }
        const timer = setTimeout(() => setArmedId(request.id), ARM_DELAY_MS);
        return () => clearTimeout(timer);
    }, [request]);
    const armed = !!request && armedId === request.id;
    const targetName = toDisplayName(request?.name);

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
            <DialogTitle id="ban-confirm-dialog-title">
                このユーザーをBANしますか？
            </DialogTitle>
            <DialogContent>
                <DialogContentText id="ban-confirm-dialog-description">
                    ゲームが、参加者をBANする操作を要求しています。BANした相手はこの部屋から退室させられ、再び入室できなくなります。
                </DialogContentText>
                {targetName && (
                    <Box
                        sx={{
                            mt: 1.5,
                            px: 1.5,
                            py: 1,
                            borderLeft: 3,
                            borderColor: "divider",
                        }}
                    >
                        <Typography
                            variant="caption"
                            color="textSecondary"
                            component="p"
                        >
                            ゲームが示した対象
                        </Typography>
                        <Typography
                            variant="subtitle1"
                            component="p"
                            sx={{
                                fontWeight: "bold",
                                overflowWrap: "anywhere",
                            }}
                        >
                            <bdi>{targetName}</bdi>
                        </Typography>
                        <Typography
                            variant="caption"
                            color="textSecondary"
                            component="p"
                        >
                            ゲーム内で使われている名前です。アカウント名とは異なる場合があります。
                        </Typography>
                    </Box>
                )}
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
