"use client";

import { useState, useTransition } from "react";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
} from "@mui/material";
import {
    Block,
    Flag,
    MoreVert,
    VisibilityOff,
    Visibility,
} from "@mui/icons-material";
import { MuteTargetMessage, useMute } from "@/lib/client/useMute";
import { useAuth } from "@/lib/client/useAuth";
import { ReportSource } from "@/lib/types";
import { banFromChatAction, BanFormState } from "@/lib/server/ban-action";
import { ReportDialog } from "./report-dialog";

const initialBanState: BanFormState = { ok: true, submitted: false };

/** 部屋主がチャット発言者をBANする導線。GM 文脈のときだけ渡す。 */
export interface BanContext {
    playId: number;
    onDone?: () => void;
}

function BanConfirmDialog({
    open,
    onClose,
    playId,
    messageId,
    authorName,
    targetIsGuest,
    onDone,
}: {
    open: boolean;
    onClose: () => void;
    playId: number;
    messageId: number;
    authorName: string;
    targetIsGuest: boolean;
    onDone?: () => void;
}) {
    const [user] = useAuth();
    const [state, setState] = useState<BanFormState>(initialBanState);
    const [pending, startTransition] = useTransition();
    // サインイン部屋主は自分の全部屋、ゲスト部屋主はこの部屋のみに効く
    const scopeNote =
        user?.authType === "oauth"
            ? "この発言者は、以後あなたが作成する部屋すべてに入室できなくなります。"
            : "この発言者は、この部屋にのみ再入室できなくなります（部屋を閉じると解除されます）。";

    const submit = () => {
        const fd = new FormData();
        fd.set("playId", `${playId}`);
        fd.set("messageId", `${messageId}`);
        startTransition(async () => {
            const next = await banFromChatAction(initialBanState, fd);
            setState(next);
            if (next.ok && next.submitted) {
                onDone?.();
                setTimeout(onClose, 1000);
            }
        });
    };

    const done = state.ok && state.submitted;

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>{authorName} さんをBAN</DialogTitle>
            <DialogContent>
                {done ? (
                    <Alert variant="outlined" severity="success">
                        BANしました。
                    </Alert>
                ) : (
                    <>
                        <DialogContentText variant="body2">
                            {scopeNote}
                            {targetIsGuest &&
                                user?.authType === "oauth" &&
                                " ゲストの迷惑行為が続く場合、ゲスト参加禁止設定の利用をご検討ください。"}
                        </DialogContentText>
                        {!state.ok && state.submitted && (
                            <Alert
                                variant="outlined"
                                severity="warning"
                                sx={{ mt: 1 }}
                            >
                                {state.message}
                            </Alert>
                        )}
                        <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
                            <Button
                                variant="outlined"
                                color="inherit"
                                onClick={onClose}
                                disabled={pending}
                            >
                                キャンセル
                            </Button>
                            <Button
                                startIcon={<Block />}
                                onClick={submit}
                                variant="contained"
                                color="error"
                                disabled={pending}
                            >
                                BANする
                            </Button>
                        </DialogActions>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

export function ModerationMenu({
    message,
    mute,
    source,
    banContext,
}: {
    message: MuteTargetMessage;
    mute: ReturnType<typeof useMute>;
    source: ReportSource;
    banContext?: BanContext;
}) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [reportOpen, setReportOpen] = useState(false);
    const [banOpen, setBanOpen] = useState(false);
    const muted = mute.isMuted(message);

    // 自分の投稿はミュート・通報・BAN いずれも対象外なのでメニュー自体を出さない
    if (message.author.isSelf) {
        return null;
    }
    // 匿名キーも投稿者 ID も無い投稿 (削除済みユーザーなど) は投稿者を対象に
    // できないためミュート・BAN は出せないが、投稿自体は通報できるので通報は残す
    const canTargetAuthor = !!message.author.anonKey;

    return (
        <>
            <IconButton
                size="small"
                aria-label="投稿の操作"
                onClick={(e) => setAnchorEl(e.currentTarget)}
                disabled={mute.pending}
            >
                <MoreVert fontSize="inherit" />
            </IconButton>
            <Menu
                anchorEl={anchorEl}
                open={!!anchorEl}
                onClose={() => setAnchorEl(null)}
            >
                {canTargetAuthor && (
                    <MenuItem
                        onClick={() => {
                            mute.toggle(message);
                            setAnchorEl(null);
                        }}
                    >
                        <ListItemIcon>
                            {muted ? (
                                <Visibility fontSize="small" />
                            ) : (
                                <VisibilityOff fontSize="small" />
                            )}
                        </ListItemIcon>
                        <ListItemText
                            primary={
                                muted
                                    ? "この人のミュートを解除"
                                    : "この人をミュート"
                            }
                            secondary={
                                mute.isPersisted
                                    ? undefined
                                    : "サインインするとミュート設定を他端末と共有できます"
                            }
                        />
                    </MenuItem>
                )}
                <MenuItem
                    onClick={() => {
                        setReportOpen(true);
                        setAnchorEl(null);
                    }}
                >
                    <ListItemIcon>
                        <Flag fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText primary="この投稿を通報" />
                </MenuItem>
                {canTargetAuthor && banContext && (
                    <MenuItem
                        onClick={() => {
                            setBanOpen(true);
                            setAnchorEl(null);
                        }}
                    >
                        <ListItemIcon>
                            <Block fontSize="small" color="error" />
                        </ListItemIcon>
                        <ListItemText primary="この人を部屋からBAN" />
                    </MenuItem>
                )}
            </Menu>
            <ReportDialog
                open={reportOpen}
                onClose={() => setReportOpen(false)}
                target={{ kind: "message", source, messageId: message.id }}
                title="投稿を通報"
            />
            {banContext && (
                <BanConfirmDialog
                    open={banOpen}
                    onClose={() => setBanOpen(false)}
                    playId={banContext.playId}
                    messageId={message.id}
                    authorName={message.author.name}
                    targetIsGuest={!message.author.id}
                    onDone={banContext.onDone}
                />
            )}
        </>
    );
}
