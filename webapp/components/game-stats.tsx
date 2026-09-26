"use client";

import { ReactNode } from "react";

import {
    Box,
    Card,
    CardContent,
    Divider,
    MenuItem,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
    useTheme,
} from "@mui/material";
import { EmojiEvents, Leaderboard, SportsEsports } from "@mui/icons-material";
import { format } from "date-fns";
import {
    GameStats,
    ScoreEntry,
    ScoreSection,
    ScoreTotal,
    StatsPeriod,
} from "@/lib/types";
import { UserInline } from "./user-inline";

const numberFormat = new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 2,
});

export function GameStatsView({
    title,
    stats,
    period,
    month,
    onPeriodChange,
    onMonthChange,
}: {
    title: string;
    stats: GameStats;
    period: StatsPeriod;
    month?: string;
    onPeriodChange: (period: StatsPeriod) => void;
    onMonthChange: (month: string) => void;
}) {
    const empty =
        stats.playRanking.length === 0 &&
        stats.sections.length === 0 &&
        stats.playRecords.length === 0;
    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Leaderboard fontSize="large" />
                <Typography variant="h5" component="h1">
                    {title} の統計
                </Typography>
            </Stack>
            <Tabs
                value={period}
                onChange={(_, value: StatsPeriod) => onPeriodChange(value)}
            >
                <Tab value="all" label="歴代" />
                <Tab value="recent" label="直近1ヶ月" />
                {stats.months.length > 0 && <Tab value="month" label="月別" />}
            </Tabs>
            {period === "month" && (
                <TextField
                    select
                    size="small"
                    label="月"
                    value={month ?? ""}
                    onChange={(ev) => onMonthChange(ev.target.value)}
                    sx={{ maxWidth: 200 }}
                    slotProps={{
                        select: {
                            MenuProps: {
                                slotProps: {
                                    paper: {
                                        // WHY: 月は年単位で積み上がるので、5 件強で
                                        // 切って続きがあるとわかるようにする
                                        sx: {
                                            maxHeight: {
                                                xs: 48 * 5.5 + 8,
                                                sm: 36 * 5.5 + 8,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    }}
                >
                    {stats.months.map((value) => (
                        <MenuItem key={value} value={value}>
                            {value.replace("-", "年")}月
                        </MenuItem>
                    ))}
                </TextField>
            )}
            {empty ? (
                <Card variant="outlined">
                    <CardContent>
                        <Typography variant="body2" color="textSecondary">
                            まだ記録がありません。ゲーム内で名前を使って参加すると、結果がここに表示されます。
                        </Typography>
                    </CardContent>
                </Card>
            ) : (
                // WHY: 1 列に積むと縦に伸びて見比べられない。広い画面では 2 列に
                // 並べ、狭い画面では 1 列に落とす
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
                        />
                    )}
                    {stats.sections.map((section) => (
                        <SectionCard
                            key={section.key}
                            section={section}
                            showChart={!section.chartHidden}
                        />
                    ))}
                </StatsGrid>
            )}
            <Typography variant="caption" color="textSecondary">
                ここに表示されるのは、ゲーム内で名前を使って参加した人の記録だけです。匿名で参加した場合は表示されません。
                {period === "month" &&
                    "月別の記録は、その月の終わりに有効だった見せ方の設定で固定されます。"}
            </Typography>
        </Stack>
    );
}

/**
 * WHY: プレイ自体の記録には順位が付かない。ランキングと同じ形で出すと、
 * 誰かの記録に見えてしまう。
 */
export function PlayRecordCard({ records }: { records: ScoreTotal[] }) {
    return (
        <Card variant="outlined">
            <CardContent>
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", mb: 1 }}
                >
                    <SportsEsports fontSize="small" color="action" />
                    <Typography variant="subtitle1" component="h2">
                        このゲームの記録
                    </Typography>
                </Stack>
                <Stack spacing={0.5}>
                    {records.map((record) => (
                        <Stack
                            key={record.key}
                            direction="row"
                            spacing={2}
                            sx={{ alignItems: "baseline", flexWrap: "wrap" }}
                        >
                            <Typography variant="body2" sx={{ minWidth: 160 }}>
                                {record.heading}
                            </Typography>
                            <Typography
                                variant="body1"
                                sx={{ fontVariantNumeric: "tabular-nums" }}
                            >
                                {numberFormat.format(record.value)}
                                {record.unit ?? ""}
                            </Typography>
                            {record.at && (
                                <Typography
                                    variant="caption"
                                    color="textSecondary"
                                >
                                    {format(new Date(record.at), "yyyy/MM/dd")}
                                </Typography>
                            )}
                        </Stack>
                    ))}
                </Stack>
            </CardContent>
        </Card>
    );
}

/**
 * 統計のカードを並べる器。
 */
export function StatsGrid({ children }: { children: ReactNode }) {
    return (
        <Box
            sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                    xl: "repeat(3, minmax(0, 1fr))",
                },
                // WHY: 同じ行のカードの高さをそろえる。ばらばらだと段差が
                // 目に付いて読みにくい
                alignItems: "stretch",
                "& > *": { height: "100%" },
            }}
        >
            {children}
        </Box>
    );
}

export function SectionCard({
    section,
    showChart,
    limit,
}: {
    section: ScoreSection;
    showChart: boolean;
    /** 表示する順位の数。省略すると全部 */
    limit?: number;
}) {
    if (section.kind === "rate" && section.rate) {
        const { achieved, total } = section.rate;
        const percent = total > 0 ? Math.round((achieved / total) * 100) : 0;
        return (
            <Card variant="outlined">
                <CardContent>
                    <Typography variant="subtitle1" component="h2">
                        {section.heading}
                    </Typography>
                    <Typography variant="h6" component="p">
                        {percent}%
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        {numberFormat.format(total)} 件中{" "}
                        {numberFormat.format(achieved)} 件
                    </Typography>
                </CardContent>
            </Card>
        );
    }
    return (
        <RankingCard
            heading={section.heading}
            unit={section.unit}
            entries={limit ? section.entries.slice(0, limit) : section.entries}
            summary={section.summary}
            showChart={showChart}
        />
    );
}

export function RankingCard({
    heading,
    unit,
    entries,
    summary,
    showChart,
}: {
    heading: string;
    unit?: string;
    entries: ScoreEntry[];
    summary?: ScoreSection["summary"];
    showChart: boolean;
}) {
    return (
        <Card variant="outlined">
            <CardContent>
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", mb: 1 }}
                >
                    <EmojiEvents fontSize="small" color="action" />
                    <Typography variant="subtitle1" component="h2">
                        {heading}
                    </Typography>
                </Stack>
                {summary && (
                    <>
                        <Stack direction="row" spacing={3} sx={{ mb: 1 }}>
                            <Summary
                                label="記録した人"
                                value={`${numberFormat.format(summary.subjects)} 人`}
                            />
                            {summary.average != null && (
                                <Summary
                                    label="平均"
                                    value={`${numberFormat.format(summary.average)}${unit ?? ""}`}
                                />
                            )}
                        </Stack>
                        <Divider sx={{ mb: 1 }} />
                    </>
                )}
                <Stack divider={<Divider flexItem />}>
                    {entries.map((entry) => (
                        <EntryRow
                            key={`${entry.rank}-${entry.name}`}
                            entry={entry}
                            unit={unit}
                            ratio={
                                showChart
                                    ? ratioOf(entry.value, entries)
                                    : undefined
                            }
                        />
                    ))}
                </Stack>
            </CardContent>
        </Card>
    );
}

function Summary({ label, value }: { label: string; value: string }) {
    return (
        <Box>
            <Typography variant="caption" color="textSecondary">
                {label}
            </Typography>
            <Typography
                variant="body1"
                sx={{ fontVariantNumeric: "tabular-nums" }}
            >
                {value}
            </Typography>
        </Box>
    );
}

function EntryRow({
    entry,
    unit,
    ratio,
}: {
    entry: ScoreEntry;
    unit?: string;
    /** 1 位に対する長さ。棒グラフを出さないときは undefined */
    ratio?: number;
}) {
    const theme = useTheme();
    return (
        <Stack
            direction="row"
            spacing={2}
            sx={{ alignItems: "center", py: 0.75 }}
        >
            <Typography
                variant="body2"
                color="textSecondary"
                sx={{ width: 32, fontVariantNumeric: "tabular-nums" }}
            >
                {entry.rank}
            </Typography>
            <Stack
                direction={{ xs: "row", sm: "column" }}
                spacing={{ xs: 1, sm: 0 }}
                sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    alignItems: { xs: "center", sm: "flex-start" },
                }}
            >
                <UserInline
                    user={{
                        id: entry.userId,
                        name: entry.name,
                        image: entry.iconURL,
                    }}
                />
                {entry.at && (
                    <Typography variant="caption" color="textSecondary">
                        {format(new Date(entry.at), "yyyy/MM/dd")}
                    </Typography>
                )}
            </Stack>
            {ratio == null ? (
                <Typography
                    variant="body1"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                    {numberFormat.format(entry.value)}
                    {unit ?? ""}
                </Typography>
            ) : (
                <Stack
                    spacing={0.25}
                    sx={{
                        width: { xs: 96, sm: 160 },
                        alignItems: "flex-end",
                        flexShrink: 0,
                    }}
                >
                    <Typography
                        variant="body2"
                        sx={{ fontVariantNumeric: "tabular-nums" }}
                    >
                        {numberFormat.format(entry.value)}
                        {unit ?? ""}
                    </Typography>
                    <Box
                        sx={{
                            width: "100%",
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: theme.palette.action.hover,
                            display: "flex",
                            justifyContent: "flex-end",
                        }}
                    >
                        <Box
                            sx={{
                                width: `${Math.max(2, Math.round(ratio * 100))}%`,
                                height: "100%",
                                borderRadius: 3,
                                backgroundColor: theme.palette.primary.light,
                            }}
                        />
                    </Box>
                </Stack>
            )}
        </Stack>
    );
}

/**
 * 棒の長さを、そのランキングの中での位置で決める。
 *
 * WHY: 値がそのまま長さになると、下位が見えないほど短くなったり、負の値で
 * はみ出したりする。最小値を起点にして、幅のある帯として見せる。
 */
function ratioOf(value: number, entries: ScoreEntry[]): number {
    const values = entries.map((entry) => entry.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max === min) {
        return 1;
    }
    const base = Math.min(0, min);
    return (value - base) / (max - base);
}
