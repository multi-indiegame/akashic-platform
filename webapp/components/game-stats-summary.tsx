"use client";

import { MouseEvent, useState } from "react";
import Link from "next/link";
import {
    Button,
    Card,
    CardContent,
    Skeleton,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { ExpandLess, ExpandMore, Leaderboard } from "@mui/icons-material";
import { useGameStats } from "@/lib/client/useGameStats";
import {
    PlayRecordCard,
    RankingCard,
    SectionCard,
    StatsGrid,
} from "./game-stats";
import { StatsModerationProvider } from "./stats-moderation";

/** ゲーム詳細に出す順位の数 */
const ENTRY_LIMIT = 3;

/**
 * ゲーム詳細に出す統計。
 */
export function GameStatsSummary({
    gameId,
    title,
}: {
    gameId: number;
    title: string;
}) {
    const theme = useTheme();
    const { isLoading, stats, error } = useGameStats(String(gameId), "all");
    const [expanded, setExpanded] = useState(false);

    if (isLoading) {
        return <Skeleton variant="rectangular" height={160} />;
    }
    if (error || !stats) {
        return null;
    }
    const empty =
        stats.sections.length === 0 &&
        stats.playRanking.length === 0 &&
        stats.playRecords.length === 0;
    const limit = expanded ? undefined : ENTRY_LIMIT;

    function toggleFooter(count: number) {
        if (count <= ENTRY_LIMIT) {
            return undefined;
        }
        return (
            <ExpandToggle
                expanded={expanded}
                onToggle={() => setExpanded((prev) => !prev)}
            />
        );
    }
    return (
        <Stack spacing={2}>
            {empty ? (
                <Card variant="outlined">
                    <CardContent>
                        <Typography variant="body2" color="textSecondary">
                            まだ記録がありません。ゲーム内で名前を使って参加すると、結果がここに表示されます。
                        </Typography>
                    </CardContent>
                </Card>
            ) : (
                <StatsModerationProvider
                    gameId={gameId}
                    title={title}
                    stats={stats}
                >
                    <StatsGrid>
                        {stats.playRecords.length > 0 && (
                            <PlayRecordCard records={stats.playRecords} />
                        )}
                        {stats.playRanking.length > 0 && (
                            <RankingCard
                                heading="遊んだ回数"
                                unit="回"
                                entries={stats.playRanking}
                                showChart={!stats.playRankingChartHidden}
                                limit={limit}
                                footer={toggleFooter(stats.playRanking.length)}
                            />
                        )}
                        {stats.sections.map((section) => (
                            <SectionCard
                                key={section.key}
                                section={section}
                                showChart={!section.chartHidden}
                                limit={limit}
                                footer={toggleFooter(section.entries.length)}
                            />
                        ))}
                    </StatsGrid>
                </StatsModerationProvider>
            )}
            <Stack
                direction="row"
                sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}
            >
                <Button
                    variant="outlined"
                    component={Link}
                    href={`/game/${gameId}/stats`}
                    startIcon={<Leaderboard />}
                    sx={{
                        borderColor: theme.palette.text.secondary,
                        color: theme.palette.text.secondary,
                    }}
                >
                    統計ページを見る
                </Button>
            </Stack>
        </Stack>
    );
}

/**
 * 全カードの順位をまとめて開閉する。
 */
function ExpandToggle({
    expanded,
    onToggle,
}: {
    expanded: boolean;
    onToggle: () => void;
}) {
    const theme = useTheme();

    function handleClick(ev: MouseEvent<HTMLButtonElement>) {
        const card = ev.currentTarget.closest(".MuiCard-root");
        onToggle();
        if (expanded && card) {
            // WHY: 閉じると上のカードも縮み、押したカードが画面の外へ動く。
            // 上に貼り付いたヘッダーの下に隠れないよう、その分ずらして戻す
            requestAnimationFrame(() => {
                const headerBottom =
                    document.querySelector("header")?.getBoundingClientRect()
                        .bottom ?? 0;
                const top = card.getBoundingClientRect().top;
                if (top < headerBottom) {
                    window.scrollBy({ top: top - headerBottom - 8 });
                }
            });
        }
    }

    return (
        <Button
            size="small"
            onClick={handleClick}
            startIcon={expanded ? <ExpandLess /> : <ExpandMore />}
            sx={{ mt: 1, color: theme.palette.text.secondary }}
        >
            {expanded ? "上位だけ表示" : "すべての順位を表示"}
        </Button>
    );
}
