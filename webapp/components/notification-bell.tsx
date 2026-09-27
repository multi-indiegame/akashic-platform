"use client";

import { MouseEvent, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatDistance } from "date-fns";
import { ja } from "date-fns/locale";
import {
    Alert,
    Avatar,
    Badge,
    Box,
    Button,
    Divider,
    IconButton,
    Menu,
    MenuItem,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { Notifications, DoneAll } from "@mui/icons-material";
import {
    markAllNotificationsReadAction,
    markNotificationReadAction,
} from "@/lib/server/notifications";
import { useAuth } from "@/lib/client/useAuth";
import { useNotifications } from "@/lib/client/useNotifications";

export function NotificationBell() {
    const theme = useTheme();
    const [user] = useAuth();
    const enabled = user?.authType === "oauth";
    const { isLoading, list, error, mutate } = useNotifications(!!enabled);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [isPending, startTransition] = useTransition();

    const unreadCount = useMemo(() => {
        if (!list) return 0;
        return list.filter((item) => item.unread).length;
    }, [list]);

    // リンク付き通知でも離脱ガードが割り込めるようにし、かつその後 Menu を閉じられるように
    useEffect(() => {
        if (!anchorEl) {
            return;
        }
        const onDocClickCapture = (ev: Event) => {
            const target = ev.target as HTMLElement | null;
            if (target?.closest("a")) {
                setTimeout(() => setAnchorEl(null), 0);
            }
        };
        document.addEventListener("click", onDocClickCapture, true);
        return () => {
            document.removeEventListener("click", onDocClickCapture, true);
        };
    }, [anchorEl]);

    if (!enabled) {
        return null;
    }

    function handleOpen(ev: MouseEvent<HTMLElement>) {
        setAnchorEl(ev.currentTarget);
    }

    function handleClose() {
        setAnchorEl(null);
    }

    function handleMarkAll() {
        startTransition(async () => {
            await markAllNotificationsReadAction();
            await mutate();
        });
    }

    function handleMarkRead(id: number) {
        startTransition(async () => {
            await markNotificationReadAction(id);
            await mutate();
        });
    }

    return (
        <>
            <IconButton aria-label="notifications" onClick={handleOpen}>
                <Badge
                    badgeContent={unreadCount > 99 ? "99+" : unreadCount}
                    color="error"
                >
                    <Notifications fontSize="large" />
                </Badge>
            </IconButton>
            <Menu
                anchorEl={anchorEl}
                open={!!anchorEl}
                onClose={handleClose}
                slotProps={{
                    paper: {
                        sx: { width: 360, maxHeight: 520 },
                    },
                }}
            >
                <Box sx={{ px: 2, pt: 1, pb: 1 }}>
                    <Stack
                        direction="row"
                        sx={{
                            justifyContent: "space-between",
                        }}
                    >
                        <Typography variant="subtitle1">通知</Typography>
                        <Button
                            startIcon={<DoneAll />}
                            size="small"
                            onClick={handleMarkAll}
                            disabled={isPending || !unreadCount}
                            sx={{
                                color: theme.palette.primary.light,
                            }}
                        >
                            すべて既読
                        </Button>
                    </Stack>
                </Box>
                <Divider />
                {isLoading ? (
                    <Box sx={{ px: 2, py: 2 }}>
                        <Typography variant="body2">読み込み中...</Typography>
                    </Box>
                ) : error ? (
                    <Box sx={{ px: 2, py: 2 }}>
                        <Alert severity="error" variant="outlined">
                            {error}
                        </Alert>
                    </Box>
                ) : list && list.length ? (
                    list.map((notice) => {
                        const content = (
                            <>
                                <Avatar
                                    src={notice.iconURL}
                                    sx={{ width: 36, height: 36 }}
                                />
                                <Stack spacing={0.5}>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            fontWeight: notice.unread
                                                ? 600
                                                : 400,
                                            whiteSpace: "pre-wrap",
                                        }}
                                    >
                                        {notice.body}
                                    </Typography>
                                    <Typography
                                        variant="caption"
                                        color="textSecondary"
                                    >
                                        {formatDistance(
                                            new Date(notice.createdAt),
                                            new Date(),
                                            { addSuffix: true, locale: ja },
                                        )}
                                    </Typography>
                                    {notice.link && (
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: theme.palette.primary
                                                    .light,
                                            }}
                                        >
                                            詳細を見る
                                        </Typography>
                                    )}
                                </Stack>
                            </>
                        );
                        const itemSx = {
                            alignItems: "flex-start",
                            gap: 2,
                            opacity: notice.unread ? 1 : 0.6,
                        };
                        return notice.link ? (
                            <MenuItem
                                key={notice.id}
                                component={Link}
                                href={notice.link}
                                onPointerDown={() => handleMarkRead(notice.id)}
                                sx={itemSx}
                            >
                                {content}
                            </MenuItem>
                        ) : (
                            <MenuItem
                                key={notice.id}
                                onClick={() => {
                                    handleMarkRead(notice.id);
                                    handleClose();
                                }}
                                sx={itemSx}
                            >
                                {content}
                            </MenuItem>
                        );
                    })
                ) : (
                    <Box sx={{ px: 2, py: 2 }}>
                        <Typography variant="body2">
                            通知はありません。
                        </Typography>
                    </Box>
                )}
            </Menu>
        </>
    );
}
