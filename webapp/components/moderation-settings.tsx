"use client";

import { useState, useTransition } from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Divider,
    List,
    ListItem,
    ListItemText,
    Stack,
    Typography,
} from "@mui/material";
import { formatDistance } from "date-fns";
import { ja } from "date-fns/locale";
import { MUTE_LIMIT_DEFAULT } from "@/lib/types";
import { useAuth } from "@/lib/client/useAuth";
import { useMutes } from "@/lib/client/useMutes";
import { useBans } from "@/lib/client/useBans";
import { useLocalMutes } from "@/lib/client/useLocalMutes";
import { clearMuteOverrides, setMuteOverride } from "@/lib/client/mute-store";
import { unmuteAction } from "@/lib/server/mute-action";
import { unbanAction } from "@/lib/server/ban-action";

const initialState = { ok: true, submitted: false } as const;

function relative(date: Date) {
    return formatDistance(date, new Date(), {
        addSuffix: true,
        locale: ja,
    });
}

function EmptyNote() {
    return (
        <Typography variant="body2" color="textSecondary" sx={{ py: 1 }}>
            ミュートしている相手はいません。
        </Typography>
    );
}

function PersistedMutes() {
    const { isLoading, list, limit, error, mutate } = useMutes(true);
    const [pending, startTransition] = useTransition();
    const [actionError, setActionError] = useState<string | undefined>();

    const unmute = (muteId: number) => {
        setActionError(undefined);
        const formData = new FormData();
        formData.set("muteId", `${muteId}`);
        startTransition(async () => {
            const state = await unmuteAction(initialState, formData);
            if (!state.ok) {
                setActionError(state.message);
                return;
            }
            // 表示中の投稿に残っている上書きを捨て、サーバーの判定に戻す
            clearMuteOverrides();
            await mutate();
        });
    };

    if (isLoading) {
        return (
            <Stack sx={{ alignItems: "center", py: 2 }}>
                <CircularProgress size={24} />
            </Stack>
        );
    }
    if (error) {
        return (
            <Alert variant="outlined" severity="error">
                {error}
            </Alert>
        );
    }
    const mutes = list ?? [];
    return (
        <Stack spacing={1}>
            <Typography variant="body2" color="textSecondary">
                サインインしているため、ミュートはアカウントに保存され、他の端末にも反映されます
                {limit != null && `（${mutes.length} / ${limit} 件）`}。
            </Typography>
            {actionError && (
                <Alert variant="outlined" severity="warning">
                    {actionError}
                </Alert>
            )}
            {mutes.length === 0 ? (
                <EmptyNote />
            ) : (
                <List disablePadding>
                    {mutes.map((mute) => (
                        <ListItem
                            key={mute.id}
                            divider
                            secondaryAction={
                                <Button
                                    size="small"
                                    onClick={() => unmute(mute.id)}
                                    disabled={pending}
                                    variant="outlined"
                                >
                                    解除
                                </Button>
                            }
                        >
                            <ListItemText
                                primary={mute.label}
                                secondary={`${relative(new Date(mute.createdAt))} にミュート`}
                                slotProps={{
                                    primary: {
                                        variant: "body2",
                                        sx: {
                                            overflowWrap: "anywhere",
                                        },
                                    },
                                }}
                            />
                        </ListItem>
                    ))}
                </List>
            )}
        </Stack>
    );
}

function LocalMutes() {
    const { entries, remove } = useLocalMutes();

    return (
        <Stack spacing={1}>
            <Alert severity="info" variant="outlined">
                サインインしていないため、ミュートはこの端末にのみ保存されます。サインインするとミュート設定を他端末と共有できるようになります（サインインすると下記の設定は引き継がれません）。
            </Alert>
            <Typography variant="body2" color="textSecondary">
                {entries.length} / {MUTE_LIMIT_DEFAULT} 件
            </Typography>
            {entries.length === 0 ? (
                <EmptyNote />
            ) : (
                <List disablePadding>
                    {entries.map((entry) => (
                        <ListItem
                            key={entry.anonKey}
                            divider
                            secondaryAction={
                                <Button
                                    size="small"
                                    onClick={() => {
                                        remove(entry.anonKey);
                                        // toggle 経由の解除と違い localStorage しか
                                        // 消さないため、先に積まれた上書きも false に
                                        // しないと戻った先でミュート表示が残る
                                        setMuteOverride(entry.anonKey, false);
                                    }}
                                    variant="outlined"
                                >
                                    解除
                                </Button>
                            }
                        >
                            <ListItemText
                                primary={entry.label}
                                secondary={`${relative(new Date(entry.createdAt))} にミュート`}
                                slotProps={{
                                    primary: {
                                        variant: "body2",
                                        sx: {
                                            overflowWrap: "anywhere",
                                        },
                                    },
                                }}
                            />
                        </ListItem>
                    ))}
                </List>
            )}
        </Stack>
    );
}

function BanList() {
    const [user] = useAuth();
    // ゲスト部屋主の BAN は部屋単位で、部屋を閉じると無意味になるため管理 UI は
    // 設けない。サインイン部屋主 (全部屋 BAN) のみ一覧・解除できる
    const { isLoading, list, limit, error, mutate } = useBans(
        user?.authType === "oauth",
    );
    const [pending, startTransition] = useTransition();
    const [actionError, setActionError] = useState<string | undefined>();

    const unban = (banId: number) => {
        setActionError(undefined);
        const fd = new FormData();
        fd.set("banId", `${banId}`);
        startTransition(async () => {
            const state = await unbanAction({ ok: true, submitted: false }, fd);
            if (!state.ok) {
                setActionError(state.message);
                return;
            }
            await mutate();
        });
    };

    if (user?.authType !== "oauth") {
        return null;
    }
    if (isLoading) {
        return (
            <Stack sx={{ alignItems: "center", py: 2 }}>
                <CircularProgress size={24} />
            </Stack>
        );
    }
    if (error) {
        return (
            <Alert variant="outlined" severity="error">
                {error}
            </Alert>
        );
    }
    const bans = list ?? [];
    return (
        <Stack spacing={1}>
            {limit != null && (
                <Typography variant="body2" color="textSecondary">
                    {bans.length} / {limit} 件
                </Typography>
            )}
            {actionError && (
                <Alert variant="outlined" severity="warning">
                    {actionError}
                </Alert>
            )}
            {bans.length === 0 ? (
                <Typography
                    variant="body2"
                    color="textSecondary"
                    sx={{ py: 1 }}
                >
                    BANしている相手はいません。
                </Typography>
            ) : (
                <List disablePadding>
                    {bans.map((ban) => (
                        <ListItem
                            key={ban.id}
                            divider
                            secondaryAction={
                                <Button
                                    size="small"
                                    onClick={() => unban(ban.id)}
                                    variant="outlined"
                                    disabled={pending}
                                >
                                    解除
                                </Button>
                            }
                        >
                            <ListItemText
                                primary={ban.label}
                                secondary={`${relative(
                                    new Date(ban.createdAt),
                                )} にBAN`}
                                slotProps={{
                                    primary: {
                                        variant: "body2",
                                        sx: { overflowWrap: "anywhere" },
                                    },
                                }}
                            />
                        </ListItem>
                    ))}
                </List>
            )}
        </Stack>
    );
}

export function ModerationSettings() {
    const [user] = useAuth();
    const isOAuth = user?.authType === "oauth";

    return (
        <Box sx={{ maxWidth: "sm", mx: "auto", py: 2, px: { xs: 1.5, sm: 0 } }}>
            <Stack spacing={3}>
                <Stack spacing={2}>
                    <Box>
                        <Typography variant="h6">ミュート</Typography>
                        <Typography variant="body2" color="textSecondary">
                            ミュートした相手の投稿は折りたたまれ、その人が立てた部屋は一覧に表示されなくなります。相手には通知されません。
                        </Typography>
                    </Box>
                    <Divider />
                    {isOAuth ? <PersistedMutes /> : <LocalMutes />}
                </Stack>
                {/* ゲスト部屋主の BAN は部屋を閉じると無意味になるため管理 UI を出さない */}
                {isOAuth && (
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="h6">BAN</Typography>
                            <Typography variant="body2" color="textSecondary">
                                自分の部屋への入室を禁止した相手の一覧です。解除すると再び入室できるようになります。
                            </Typography>
                        </Box>
                        <Divider />
                        <BanList />
                    </Stack>
                )}
            </Stack>
        </Box>
    );
}
