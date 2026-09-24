"use client";

import Link from "next/link";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Divider,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import { Leaderboard } from "@mui/icons-material";
import { format } from "date-fns";
import {
    MyGameStats,
    MyScoreboard,
    MyScoreRecord,
    TitleBadge,
} from "@/lib/types";
import { TitleBadges } from "./title-badges";
import { UserInline } from "./user-inline";

const numberFormat = new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 2,
});

export function MyScoreboardView({
    data,
    user,
}: {
    data: MyScoreboard;
    /** 誰の記録かを添える。自分の記録を見ているときは省く */
    user?: { id: string; name: string; image?: string };
}) {
    if (data.games.length === 0 && data.titles.length === 0) {
        return (
            <Alert variant="outlined" severity="info">
                まだ記録がありません。ゲーム内で名前を使って参加すると、結果がここに表示されます。
            </Alert>
        );
    }
    return (
        <Stack spacing={4}>
            {user && (
                <Card variant="outlined">
                    <CardContent>
                        <UserInline
                            user={user}
                            textVariant="h6"
                            avatarSize={48}
                        />
                    </CardContent>
                </Card>
            )}
            {data.titles.length > 0 && (
                <Stack spacing={2}>
                    <Typography variant="h6" component="h2">
                        持っている称号
                    </Typography>
                    {groupByGame(data.titles).map(([gameId, titles]) => (
                        <Card key={gameId} variant="outlined">
                            <CardContent>
                                <Stack spacing={1}>
                                    <Typography
                                        variant="subtitle2"
                                        component={Link}
                                        href={`/game/${gameId}`}
                                        style={{
                                            color: "inherit",
                                            textDecoration: "none",
                                        }}
                                    >
                                        {titles[0].gameTitle}
                                    </Typography>
                                    <TitleBadges
                                        titles={titles}
                                        size="medium"
                                        withGameName={false}
                                    />
                                </Stack>
                            </CardContent>
                        </Card>
                    ))}
                </Stack>
            )}
            <Stack spacing={2}>
                <Typography variant="h6" component="h2">
                    遊んだゲーム
                </Typography>
                {data.games.map((game) => (
                    <GameCard key={game.gameId} game={game} />
                ))}
            </Stack>
        </Stack>
    );
}

/**
 * WHY: 称号はゲームごとの肩書き。ゲーム単位に区切る。
 */
function groupByGame(titles: TitleBadge[]): [number, TitleBadge[]][] {
    const byGame = new Map<number, TitleBadge[]>();
    for (const title of titles) {
        byGame.set(title.gameId, [...(byGame.get(title.gameId) ?? []), title]);
    }
    return [...byGame.entries()];
}

function GameCard({ game }: { game: MyGameStats }) {
    return (
        <Card variant="outlined">
            <CardContent>
                <Stack spacing={2}>
                    <Stack direction="row" spacing={2}>
                        <Avatar
                            variant="square"
                            src={game.iconURL}
                            alt=""
                            sx={{ width: 64, height: 64 }}
                        />
                        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                                variant="subtitle1"
                                component={Link}
                                href={`/game/${game.gameId}`}
                                style={{
                                    color: "inherit",
                                    textDecoration: "none",
                                }}
                            >
                                {game.title}
                            </Typography>
                            <UserInline
                                user={{
                                    id: game.publisher.id,
                                    name: game.publisher.name,
                                    image: game.publisher.image,
                                }}
                                textVariant="body2"
                                avatarSize={20}
                            />
                            <Box>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    component={Link}
                                    href={`/game/${game.gameId}/stats`}
                                    startIcon={<Leaderboard />}
                                >
                                    このゲームの統計
                                </Button>
                            </Box>
                        </Stack>
                    </Stack>
                    <Divider />
                    <Stack
                        direction="row"
                        divider={<Divider orientation="vertical" flexItem />}
                        spacing={2}
                        sx={{ flexWrap: "wrap", rowGap: 1 }}
                    >
                        <Fact
                            label="遊んだ回数"
                            value={`${numberFormat.format(game.playCount)} 回`}
                        />
                        <Fact
                            label="作った部屋"
                            value={`${numberFormat.format(game.roomCount)} 件`}
                        />
                        <Fact
                            label="最後に遊んだ日"
                            value={format(
                                new Date(game.lastPlayedAt),
                                "yyyy/MM/dd",
                            )}
                        />
                    </Stack>
                    {game.records.length > 0 && (
                        <RecordTable records={game.records} />
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <Box>
            <Typography variant="caption" color="textSecondary" component="div">
                {label}
            </Typography>
            <Typography variant="body2">{value}</Typography>
        </Box>
    );
}

function RecordTable({ records }: { records: MyScoreRecord[] }) {
    return (
        <Table size="small">
            <TableHead>
                <TableRow>
                    <TableCell>記録</TableCell>
                    <TableCell align="right">自分の値</TableCell>
                    <TableCell align="right">順位</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {records.map((record) => (
                    <TableRow key={record.key}>
                        <TableCell>
                            <Typography variant="body2">
                                {record.heading}
                            </Typography>
                            {record.at && (
                                <Typography
                                    variant="caption"
                                    color="textSecondary"
                                >
                                    {format(new Date(record.at), "yyyy/MM/dd")}
                                </Typography>
                            )}
                        </TableCell>
                        <TableCell
                            align="right"
                            sx={{ fontVariantNumeric: "tabular-nums" }}
                        >
                            {numberFormat.format(record.value)}
                            {record.unit ?? ""}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                            {numberFormat.format(record.rank)} 位
                            <Typography
                                variant="caption"
                                color="textSecondary"
                                sx={{ ml: 0.5 }}
                            >
                                / {numberFormat.format(record.total)} 人
                            </Typography>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
