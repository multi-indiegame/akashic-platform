"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Skeleton,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import {
    ArrowBack,
    Download,
    ExpandLess,
    ExpandMore,
} from "@mui/icons-material";
import { ContentLogEntry, ContentLogInfo } from "@/lib/types";
import { useAuth } from "@/lib/client/useAuth";
import { useGame } from "@/lib/client/useGame";
import { useContentLogList } from "@/lib/client/useContentLogList";
import { useClientLogList } from "@/lib/client/useClientLogList";

function PlayErrorDetails({
    contentId,
    playId,
    logDeletedAt,
}: {
    contentId: number;
    playId: number;
    logDeletedAt: Date | null;
}) {
    const theme = useTheme();
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<ContentLogEntry[] | null>(null);
    const [fetchError, setFetchError] = useState<string>();

    if (logDeletedAt != null) {
        return null;
    }

    async function handleToggle() {
        if (!expanded && entries === null && !loading) {
            setLoading(true);
            // clientLog のように useSWRMutation を使った方がシンプル。
            // 優先度低いためそのままにしている。治すならいつか治す。
            try {
                const res = await fetch(
                    `/api/content/${contentId}/play/${playId}/logs?filter=error&format=json`,
                );
                if (res.status === 404) {
                    setEntries([]);
                } else if (!res.ok) {
                    throw new Error(res.statusText);
                } else {
                    const text = await res.text();
                    const parsed = text
                        .split("\n")
                        .filter((l) => l.trim())
                        .map((l) => JSON.parse(l) as ContentLogEntry);
                    setEntries(parsed);
                }
            } catch {
                setFetchError("エラーログの取得に失敗しました。");
            } finally {
                setLoading(false);
            }
        }
        setExpanded((prev) => !prev);
    }

    return (
        <Box>
            <Button
                startIcon={expanded ? <ExpandLess /> : <ExpandMore />}
                variant="outlined"
                size="small"
                onClick={handleToggle}
                sx={{
                    borderColor: theme.palette.warning.dark,
                    color: theme.palette.warning.dark,
                }}
            >
                {expanded ? "エラーログを隠す" : "エラーログを表示"}
            </Button>
            {expanded && (
                <Box sx={{ mt: 1 }}>
                    {loading && <CircularProgress size={20} />}
                    {fetchError && (
                        <Alert
                            severity="error"
                            variant="outlined"
                            sx={{ mb: 1 }}
                        >
                            {fetchError}
                        </Alert>
                    )}
                    {entries != null && entries.length === 0 && (
                        <Typography variant="body2" color="textSecondary">
                            エラーログはありません。
                        </Typography>
                    )}
                    {entries?.map((entry, i) => (
                        <Box key={i} sx={{ mb: 2 }}>
                            <Typography
                                variant="caption"
                                color="textSecondary"
                                sx={{
                                    display: "block",
                                }}
                            >
                                {new Date(entry.timestamp).toLocaleString(
                                    "ja-JP",
                                )}
                            </Typography>
                            <Box
                                component="pre"
                                sx={{
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    m: 0,
                                    p: 1,
                                    bgcolor: theme.palette.background.default,
                                    borderRadius: 1,
                                    fontSize: "0.8rem",
                                    fontFamily: "monospace",
                                }}
                            >
                                {entry.message}
                            </Box>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}

function ClientLogDetails({
    contentId,
    playId,
    logDeletedAt,
}: {
    contentId: number;
    playId: number;
    logDeletedAt: Date | null;
}) {
    const theme = useTheme();
    const [expanded, setExpanded] = useState(false);
    const { isLoading, list, error, trigger } = useClientLogList(
        contentId,
        playId,
    );

    if (logDeletedAt != null) {
        return (
            <Typography variant="body2" color="textSecondary">
                保存期間が過ぎたため、ログデータは削除されました
            </Typography>
        );
    }

    function handleClick() {
        if (!expanded) {
            trigger();
        }
        setExpanded((prev) => !prev);
    }

    return (
        <Box>
            <Button
                startIcon={expanded ? <ExpandLess /> : <ExpandMore />}
                variant="outlined"
                size="small"
                onClick={handleClick}
                sx={{
                    borderColor: theme.palette.warning.dark,
                    color: theme.palette.warning.dark,
                }}
            >
                {expanded
                    ? "プレイヤーから報告されたログを隠す"
                    : "プレイヤーから報告されたログを表示"}
            </Button>
            {expanded && (
                <Box sx={{ mt: 1 }}>
                    {isLoading && <CircularProgress size={20} />}
                    {error && (
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {error}
                        </Alert>
                    )}
                    {list?.map((submission) => (
                        <Box
                            key={submission.id}
                            sx={{
                                mb: 2,
                                p: 1,
                                borderRadius: 1,
                                bgcolor: theme.palette.background.default,
                            }}
                        >
                            <Stack
                                direction="row"
                                spacing={1}
                                sx={{
                                    mb: 0.5,
                                    alignItems: "center",
                                }}
                            >
                                {submission.reporter?.image && (
                                    <Avatar
                                        src={submission.reporter.image}
                                        sx={{
                                            width: 20,
                                            height: 20,
                                            fontSize: "0.7rem",
                                        }}
                                    />
                                )}
                                <Typography
                                    variant="caption"
                                    color="textSecondary"
                                >
                                    {submission.reporter?.name ?? "ゲスト"} —
                                    送信{" "}
                                    {new Date(
                                        submission.submittedAt,
                                    ).toLocaleString("ja-JP")}
                                </Typography>
                            </Stack>
                            {submission.comments.length > 0 && (
                                <Box sx={{ mb: 1 }}>
                                    <Typography
                                        variant="caption"
                                        color="textSecondary"
                                        sx={{
                                            display: "block",
                                        }}
                                    >
                                        コメント
                                    </Typography>
                                    <Box
                                        component="pre"
                                        sx={{
                                            whiteSpace: "pre-wrap",
                                            wordBreak: "break-word",
                                            m: 0,
                                            p: 1,
                                            bgcolor:
                                                theme.palette.background.paper,
                                            borderRadius: 1,
                                            fontSize: "0.8rem",
                                        }}
                                    >
                                        {submission.comments.join("\n---\n")}
                                    </Box>
                                </Box>
                            )}
                            {submission.entries.length === 0 ? (
                                <Typography
                                    variant="body2"
                                    color="textSecondary"
                                >
                                    出力されたログがありません。
                                </Typography>
                            ) : (
                                <Box
                                    component="pre"
                                    sx={{
                                        bgcolor: theme.palette.background.paper,
                                        borderRadius: 1,
                                        p: 1,
                                    }}
                                >
                                    {submission.entries.map((entry, i) => {
                                        if (
                                            entry.type === "truncation_marker"
                                        ) {
                                            return (
                                                <Typography
                                                    key={i}
                                                    variant="caption"
                                                    align="center"
                                                    color="textSecondary"
                                                    sx={{
                                                        display: "block",
                                                        fontSize: "0.75rem",
                                                        fontStyle: "italic",
                                                    }}
                                                >
                                                    ※
                                                    以前のログは上限超過により省略されました
                                                </Typography>
                                            );
                                        }
                                        return (
                                            <Stack
                                                key={i}
                                                direction="row"
                                                spacing={1}
                                            >
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        fontSize: "0.75rem",
                                                        fontFamily: "monospace",
                                                        color:
                                                            entry.level ===
                                                            "error"
                                                                ? theme.palette
                                                                      .error
                                                                      .light
                                                                : entry.level ===
                                                                    "warn"
                                                                  ? theme
                                                                        .palette
                                                                        .warning
                                                                        .light
                                                                  : theme
                                                                        .palette
                                                                        .text
                                                                        .secondary,
                                                    }}
                                                >
                                                    [{entry.level.padEnd(5)}]
                                                </Typography>
                                                <Typography
                                                    sx={{
                                                        fontSize: "0.75rem",
                                                        fontFamily: "monospace",
                                                    }}
                                                >
                                                    {new Date(
                                                        entry.timestamp,
                                                    ).toLocaleString("ja-JP")}
                                                </Typography>
                                                <Typography
                                                    component="pre"
                                                    sx={{
                                                        whiteSpace: "pre-wrap",
                                                        wordBreak: "break-word",
                                                        fontSize: "0.75rem",
                                                        fontFamily: "monospace",
                                                    }}
                                                >
                                                    {entry.message}
                                                </Typography>
                                            </Stack>
                                        );
                                    })}
                                </Box>
                            )}
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}

function ContentLogCard({ info }: { info: ContentLogInfo }) {
    const theme = useTheme();
    const hasError = info.crashed || info.errorLogged;

    return (
        <Box
            id={`play-${info.playId}`}
            sx={{
                borderRadius: 1,
                p: 2,
                backgroundColor: theme.palette.background.paper,
            }}
        >
            <Stack spacing={1}>
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <Typography
                        variant="subtitle1"
                        sx={{
                            fontWeight: "bold",
                        }}
                    >
                        {info.name}
                    </Typography>
                    {info.crashed && (
                        <Chip label="強制終了" color="error" size="small" />
                    )}
                    {!info.crashed && info.errorLogged && (
                        <Chip label="エラーあり" color="warning" size="small" />
                    )}
                    {!hasError && (
                        <Chip
                            label="エラーなし"
                            size="small"
                            variant="outlined"
                        />
                    )}
                    {info.clientLogCount > 0 && (
                        <Chip
                            label={`プレイヤーから報告されたログ ${info.clientLogCount} 件`}
                            color="info"
                            size="small"
                            variant="outlined"
                        />
                    )}
                </Stack>

                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        alignItems: "center",
                    }}
                >
                    {info.gameMaster.iconURL && (
                        <Avatar
                            src={info.gameMaster.iconURL}
                            sx={{ width: 20, height: 20 }}
                        />
                    )}
                    <Typography variant="body2" color="textSecondary">
                        {info.gameMaster.name}
                    </Typography>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Typography variant="body2" color="textSecondary">
                        開始: {new Date(info.createdAt).toLocaleString("ja-JP")}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        終了:{" "}
                        {info.endedAt
                            ? new Date(info.endedAt).toLocaleString("ja-JP")
                            : "-"}
                    </Typography>
                </Stack>

                {hasError && (
                    <PlayErrorDetails
                        contentId={info.contentId}
                        playId={info.playId}
                        logDeletedAt={info.logDeletedAt}
                    />
                )}
                {info.clientLogCount > 0 && (
                    <ClientLogDetails
                        contentId={info.contentId}
                        playId={info.playId}
                        logDeletedAt={info.logDeletedAt}
                    />
                )}

                {info.logDeletedAt != null ? (
                    <Typography variant="body2" color="textSecondary">
                        保存期間が過ぎたため、プレイヤーから報告されたログは削除されました
                    </Typography>
                ) : info.logUploadedAt ? (
                    <Button
                        variant="outlined"
                        size="small"
                        href={`/api/content/${info.contentId}/play/${info.playId}/logs`}
                        download={`content_log_play${info.playId}.txt`}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            alignSelf: "flex-start",
                            borderColor: theme.palette.primary.light,
                            color: theme.palette.primary.light,
                        }}
                        startIcon={<Download fontSize="small" />}
                    >
                        全てのログをダウンロード
                    </Button>
                ) : (
                    <Typography variant="body2" color="textSecondary">
                        ログ準備中 (しばらくお待ち下さい)
                    </Typography>
                )}
            </Stack>
        </Box>
    );
}

export default function ContentLogs() {
    const { id } = useParams<{ id: string }>();
    const theme = useTheme();
    const [user] = useAuth();
    const {
        isLoading: isGameLoading,
        gameInfo,
        error: gameError,
    } = useGame(id);
    const {
        isLoading: isContentLogsLoading,
        list,
        page,
        setPage,
        isEmpty,
        isEnd,
        error: contentLogsError,
    } = useContentLogList(id);

    const isPublisher = useMemo(() => {
        if (!user || user.authType !== "oauth" || !gameInfo) {
            return false;
        }
        return user.id === gameInfo.publisher.id;
    }, [user, gameInfo]);

    function handleClickMore() {
        setPage(page + 1);
    }

    if (isGameLoading) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Skeleton variant="rectangular" height={240} />
            </Container>
        );
    }

    if (gameError || !gameInfo) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Alert severity="error" variant="outlined">
                    {gameError ?? "読み込みに失敗しました。"}
                </Alert>
            </Container>
        );
    }

    if (!isPublisher) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Alert severity="error" variant="outlined">
                    このページへのアクセス権がありません。
                </Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="md" sx={{ py: 2 }}>
            <Stack
                spacing={1}
                direction="row"
                sx={{
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Button
                    component={Link}
                    href={`/game/${id}`}
                    variant="text"
                    size="large"
                    startIcon={<ArrowBack fontSize="large" />}
                    sx={{ flex: 1, justifyContent: "start" }}
                />
                <Avatar
                    variant="square"
                    src={gameInfo.iconURL}
                    sx={{ width: 60, height: 60 }}
                />
                <Typography variant="h5" component="h1" gutterBottom>
                    {gameInfo.title} - ログ一覧
                </Typography>
                <Box sx={{ flex: 1 }} />
            </Stack>
            <Typography variant="body2" color="textSecondary" sx={{ my: 1 }}>
                終了した部屋のログのみ表示されます。
                (反映には若干時間がかかります)
            </Typography>
            {isContentLogsLoading ? (
                <Stack spacing={2}>
                    <Skeleton variant="rectangular" height={120} />
                    <Skeleton variant="rectangular" height={120} />
                </Stack>
            ) : contentLogsError ? (
                <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
                    {contentLogsError}
                </Alert>
            ) : !list || isEmpty ? (
                <Typography color="textSecondary">
                    まだログがありません。
                </Typography>
            ) : (
                <Stack spacing={2}>
                    {list.flat().map((info) => (
                        <ContentLogCard key={info.contentId} info={info} />
                    ))}

                    {!isEnd && (
                        <Button
                            startIcon={<ExpandMore />}
                            onClick={handleClickMore}
                            sx={{
                                backgroundColor: theme.palette.background.paper,
                                borderColor: theme.palette.primary.light,
                                color: theme.palette.primary.light,
                            }}
                            size="large"
                        >
                            もっと読む
                        </Button>
                    )}
                </Stack>
            )}
        </Container>
    );
}
