"use client";

import { MouseEvent, ReactNode, useState } from "react";
import { format } from "date-fns";
import {
    Avatar,
    Box,
    Button,
    Paper,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import { ExpandMore } from "@mui/icons-material";
import { useAuth } from "@/lib/client/useAuth";
import { GameInfo } from "@/lib/types";
import { verticalButtonSx } from "@/lib/client/theme";
import { GameDescription } from "./text-with-links";
import { FavoriteButton } from "./favorite-button";

export function GameActions({
    isTable,
    children,
}: {
    isTable: boolean;
    children: ReactNode;
}) {
    const theme = useTheme();
    return (
        <Stack
            direction={isTable ? "column" : { xs: "column", sm: "row" }}
            spacing={1}
            sx={
                isTable
                    ? verticalButtonSx
                    : { [theme.breakpoints.only("xs")]: verticalButtonSx }
            }
        >
            {children}
        </Stack>
    );
}

function Loading() {
    return (
        <TableRow>
            <TableCell colSpan={4}>
                <Skeleton variant="rounded" width="100%" />
            </TableCell>
        </TableRow>
    );
}

function NoResult() {
    return (
        <TableRow>
            <TableCell colSpan={4}>
                <Typography
                    variant="body1"
                    color="textSecondary"
                    align="center"
                >
                    ゲームが見つかりませんでした
                </Typography>
            </TableCell>
        </TableRow>
    );
}

function GameTableCells({
    list,
    renderActions,
    expandedSet,
    onToggleDescription,
    withFavorite,
}: {
    list: GameInfo[];
    renderActions?: (game: GameInfo, isTable: boolean) => ReactNode;
    expandedSet: Set<number>;
    onToggleDescription: (e: MouseEvent, id: number) => void;
    withFavorite: boolean;
}) {
    return list.map((game) => (
        <TableRow key={game.contentId} hover>
            <TableCell>
                <Stack direction="row" spacing={2}>
                    <Avatar
                        variant="square"
                        src={game.iconURL}
                        sx={{
                            width: 96,
                            height: 96,
                        }}
                    />
                    <Stack spacing={1}>
                        <Typography variant="body1">{game.title}</Typography>
                        <GameDescription
                            description={game.description}
                            gameId={game.contentId}
                            expanded={expandedSet.has(game.contentId)}
                            onToggle={onToggleDescription}
                        />
                    </Stack>
                </Stack>
            </TableCell>
            <TableCell>
                <Typography variant="body2" color="textSecondary">
                    {format(game.createdAt, "yyyy/MM/dd")}
                </Typography>
            </TableCell>
            <TableCell>
                <Typography
                    variant="body2"
                    color="textSecondary"
                    sx={{
                        width: "max-content",
                    }}
                >
                    {game.playCount.toLocaleString()} 回
                </Typography>
            </TableCell>
            <TableCell
                sx={{
                    whiteSpace: "nowrap",
                    // WHY: 列幅を最長のボタン列に合わせ、ゲームごとにボタン幅がばらつかないようにする
                    width: "1%",
                }}
            >
                {renderActions?.(game, true)}
            </TableCell>
            {withFavorite && (
                <TableCell>
                    <FavoriteButton
                        gameId={game.id}
                        initialFavorited={game.isFavorited}
                    />
                </TableCell>
            )}
        </TableRow>
    ));
}

export function GameListTable({
    list,
    isLoading,
    isEmpty,
    isEnd,
    onLoadMore,
    renderActions,
}: {
    list?: GameInfo[];
    isLoading: boolean;
    isEmpty: boolean;
    isEnd: boolean;
    onLoadMore: () => void;
    renderActions?: (game: GameInfo, isTable: boolean) => ReactNode;
}) {
    const theme = useTheme();
    const [user] = useAuth();
    const isTable = useMediaQuery(theme.breakpoints.up("md"));
    const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
    const withFavorites = !!user && user.authType !== "guest";

    function handleToggleDescription(e: MouseEvent, id: number) {
        e.stopPropagation();
        setExpandedSet((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    if (!isTable) {
        return (
            <Stack spacing={2}>
                {isLoading ? (
                    <Skeleton variant="rounded" width="100%" height={120} />
                ) : list == null || isEmpty ? (
                    <Typography
                        variant="body1"
                        color="textSecondary"
                        align="center"
                    >
                        ゲームが見つかりませんでした
                    </Typography>
                ) : (
                    <Stack spacing={2}>
                        {list.map((game) => (
                            <Paper
                                key={game.contentId}
                                sx={{ padding: 2 }}
                                variant="outlined"
                            >
                                <Stack spacing={1.5}>
                                    <Stack direction="row" spacing={2}>
                                        <Avatar
                                            variant="square"
                                            src={game.iconURL}
                                            sx={{
                                                width: 72,
                                                height: 72,
                                            }}
                                        />
                                        <Stack
                                            spacing={0.5}
                                            sx={{ minWidth: 0, flex: 1 }}
                                        >
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                sx={{
                                                    alignItems: "center",
                                                }}
                                            >
                                                <Typography variant="body1">
                                                    {game.title}
                                                </Typography>
                                                <FavoriteButton
                                                    gameId={game.id}
                                                    initialFavorited={
                                                        game.isFavorited
                                                    }
                                                    size="medium"
                                                />
                                            </Stack>
                                            <GameDescription
                                                description={game.description}
                                                gameId={game.contentId}
                                                expanded={expandedSet.has(
                                                    game.contentId,
                                                )}
                                                onToggle={
                                                    handleToggleDescription
                                                }
                                            />
                                        </Stack>
                                    </Stack>
                                    <Stack
                                        direction="row"
                                        spacing={2}
                                        sx={{
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        <Typography
                                            variant="body2"
                                            color="textSecondary"
                                        >
                                            投稿日:{" "}
                                            {format(
                                                game.createdAt,
                                                "yyyy/MM/dd",
                                            )}
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            color="textSecondary"
                                        >
                                            プレイ数:{" "}
                                            {game.playCount.toLocaleString()} 回
                                        </Typography>
                                    </Stack>
                                    {renderActions && (
                                        <Box
                                            sx={{
                                                width: {
                                                    xs: "100%",
                                                    sm: "max-content",
                                                },
                                            }}
                                        >
                                            {renderActions(game, false)}
                                        </Box>
                                    )}
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                )}
                {!isLoading && list != null && !isEmpty && !isEnd && (
                    <Button
                        startIcon={<ExpandMore />}
                        onClick={onLoadMore}
                        sx={{
                            backgroundColor: theme.palette.background.paper,
                        }}
                        size="large"
                    >
                        もっと読む
                    </Button>
                )}
            </Stack>
        );
    }

    return (
        <TableContainer component={Paper}>
            <Table stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>ゲーム名</TableCell>
                        <TableCell>投稿日</TableCell>
                        <TableCell
                            sx={{
                                width: "max-content",
                                whiteSpace: "nowrap",
                            }}
                        >
                            プレイ数
                        </TableCell>
                        <TableCell />
                        {withFavorites && <TableCell />}
                    </TableRow>
                </TableHead>
                {isLoading ? (
                    <TableBody>
                        <Loading />
                    </TableBody>
                ) : list == null || isEmpty ? (
                    <TableBody>
                        <NoResult />
                    </TableBody>
                ) : (
                    <TableBody>
                        <GameTableCells
                            list={list}
                            renderActions={renderActions}
                            expandedSet={expandedSet}
                            onToggleDescription={handleToggleDescription}
                            withFavorite={!!user && user.authType !== "guest"}
                        />
                        {!isEnd && (
                            <TableRow>
                                <TableCell
                                    colSpan={4}
                                    sx={{ textAlign: "center" }}
                                >
                                    <Button
                                        startIcon={<ExpandMore />}
                                        onClick={onLoadMore}
                                        sx={{
                                            backgroundColor:
                                                theme.palette.background.paper,
                                        }}
                                        size="large"
                                    >
                                        もっと読む
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                )}
            </Table>
        </TableContainer>
    );
}
