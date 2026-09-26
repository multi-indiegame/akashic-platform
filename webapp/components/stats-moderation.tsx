"use client";

import { createContext, ReactNode, useContext, useState } from "react";
import {
    Alert,
    Box,
    ButtonBase,
    IconButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Stack,
    Typography,
} from "@mui/material";
import { Flag, MoreVert, Visibility, VisibilityOff } from "@mui/icons-material";
import { GameStats, ScoreEntry } from "@/lib/types";
import {
    StatsModeration,
    useStatsModeration,
} from "@/lib/client/useStatsModeration";
import { ReportDialog } from "./report-dialog";

// タッチターゲットとして確保する最小高さ
const BAR_MIN_HEIGHT = 32;

const StatsModerationContext = createContext<StatsModeration | null>(null);

/**
 * ランキングの各行にミュート・通報を出すための器。囲まれていない
 * ランキングには操作を出さない。
 */
export function StatsModerationProvider({
    gameId,
    title,
    stats,
    children,
}: {
    gameId: number;
    title: string;
    stats: GameStats;
    children: ReactNode;
}) {
    const moderation = useStatsModeration(gameId, title, stats);
    return (
        <StatsModerationContext.Provider value={moderation}>
            <Stack spacing={2}>
                {moderation.error && (
                    <Alert
                        variant="outlined"
                        severity="warning"
                        onClose={moderation.clearError}
                    >
                        {moderation.error}
                    </Alert>
                )}
                {children}
            </Stack>
        </StatsModerationContext.Provider>
    );
}

export function useStatsModerationContext() {
    return useContext(StatsModerationContext);
}

export function ScoreEntryMenu({
    entry,
    moderation,
}: {
    entry: ScoreEntry;
    moderation: StatsModeration;
}) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [reportOpen, setReportOpen] = useState(false);

    if (!entry.subject || !moderation.canReport(entry)) {
        // WHY: メニューの有無で棒グラフの位置がずれないよう、同じ幅を空けておく
        return (
            <IconButton
                size="small"
                disabled
                aria-hidden
                sx={{ flexShrink: 0, visibility: "hidden" }}
            >
                <MoreVert fontSize="inherit" />
            </IconButton>
        );
    }
    const muted = moderation.isMuted(entry);

    return (
        <>
            <IconButton
                size="small"
                aria-label="ランキングの操作"
                onClick={(e) => setAnchorEl(e.currentTarget)}
                disabled={moderation.pending}
                sx={{ flexShrink: 0 }}
            >
                <MoreVert fontSize="inherit" />
            </IconButton>
            <Menu
                anchorEl={anchorEl}
                open={!!anchorEl}
                onClose={() => setAnchorEl(null)}
            >
                {moderation.canMute(entry) && (
                    <MenuItem
                        onClick={() => {
                            moderation.toggle(entry);
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
                                moderation.isPersisted
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
                    <ListItemText primary="表示名を通報" />
                </MenuItem>
            </Menu>
            <ReportDialog
                open={reportOpen}
                onClose={() => setReportOpen(false)}
                target={{
                    kind: "scoreSubject",
                    gameId: moderation.gameId,
                    subject: entry.subject,
                }}
                title="表示名を通報"
                description="ランキングに表示されているこの人の名前を運営に通報します。相手には通知されません。"
            />
        </>
    );
}

/**
 * ミュートした人の行は名前も記録も出さず、順位だけを残す。
 *
 * WHY: 下の人を繰り上げると、自分の画面だけ順位がずれて他の人と話が
 * 噛み合わなくなる。順位の欠けが不具合に見えないよう、空いた理由を示す。
 * 展開時は children（メニュー付きの行）を出し、ミュート解除・通報はそこから行う。
 */
export function MutedEntry({
    rank,
    children,
}: {
    rank: number;
    children: ReactNode;
}) {
    const [revealed, setRevealed] = useState(false);

    if (revealed) {
        return (
            <Box sx={{ opacity: 0.6, pt: 0.5 }}>
                <ButtonBase onClick={() => setRevealed(false)}>
                    <Typography variant="caption" color="textSecondary">
                        ミュート中の人を表示しています（クリックで隠す）
                    </Typography>
                </ButtonBase>
                {children}
            </Box>
        );
    }

    return (
        <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: "center", py: 0.75 }}
        >
            <Typography
                variant="body2"
                color="textSecondary"
                sx={{
                    width: 32,
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {rank}
            </Typography>
            <ButtonBase
                onClick={() => setRevealed(true)}
                sx={{
                    flexGrow: 1,
                    minHeight: BAR_MIN_HEIGHT,
                    justifyContent: "flex-start",
                    textAlign: "left",
                    borderRadius: 1,
                    px: 0.5,
                }}
            >
                <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ alignItems: "center" }}
                >
                    <VisibilityOff fontSize="inherit" color="disabled" />
                    <Typography variant="caption" color="textSecondary">
                        ミュート中の人です（クリックで表示）
                    </Typography>
                </Stack>
            </ButtonBase>
        </Stack>
    );
}
