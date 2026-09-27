"use client";

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
import { Leaderboard } from "@mui/icons-material";
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
                                entries={stats.playRanking.slice(
                                    0,
                                    ENTRY_LIMIT,
                                )}
                                showChart={!stats.playRankingChartHidden}
                            />
                        )}
                        {stats.sections.map((section) => (
                            <SectionCard
                                key={section.key}
                                section={section}
                                showChart={!section.chartHidden}
                                limit={ENTRY_LIMIT}
                            />
                        ))}
                    </StatsGrid>
                </StatsModerationProvider>
            )}
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
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
