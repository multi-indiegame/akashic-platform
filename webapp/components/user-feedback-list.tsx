"use client";

import Link from "next/link";
import { formatDistance } from "date-fns";
import { ja } from "date-fns/locale";
import {
    Alert,
    Avatar,
    Button,
    Card,
    CardContent,
    Divider,
    Skeleton,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { UserFeedbackItem } from "@/lib/types";
import { FeedbackReplyForm } from "./feedback-reply-form";
import { ExpandMore } from "@mui/icons-material";

export function UserFeedbackList({
    title,
    list,
    isLoading,
    isEmpty,
    isEnd,
    error,
    onLoadMore,
    showReplyForm,
    onRefresh,
    emptyMessage,
}: {
    title: string;
    list?: UserFeedbackItem[];
    isLoading: boolean;
    isEmpty: boolean;
    isEnd: boolean;
    error?: string;
    onLoadMore: () => void;
    showReplyForm?: boolean;
    onRefresh?: () => void;
    emptyMessage: string;
}) {
    const theme = useTheme();

    if (isLoading) {
        return (
            <Stack spacing={2}>
                <Typography variant="h6">{title}</Typography>
                <Skeleton variant="rectangular" height={240} />
            </Stack>
        );
    }

    if (error) {
        return (
            <Stack spacing={2}>
                <Typography variant="h6">{title}</Typography>
                <Alert severity="error" variant="outlined">
                    {error}
                </Alert>
            </Stack>
        );
    }

    return (
        <Stack spacing={2}>
            <Typography variant="h6">{title}</Typography>
            {list == null || isEmpty ? (
                <Alert severity="info" variant="outlined">
                    {emptyMessage}
                </Alert>
            ) : (
                <>
                    <Stack spacing={2}>
                        {list.map((post) => (
                            <Card key={post.id} id={`feedback-${post.id}`}>
                                <CardContent>
                                    <Stack spacing={2}>
                                        <Stack
                                            direction="row"
                                            spacing={2}
                                            sx={{
                                                alignItems: "center",
                                            }}
                                        >
                                            <Avatar
                                                variant="square"
                                                src={post.game.iconURL}
                                                sx={{ width: 56, height: 56 }}
                                            />
                                            <Stack spacing={0.5}>
                                                <Typography
                                                    variant="subtitle2"
                                                    color="textSecondary"
                                                >
                                                    フィードバック先
                                                </Typography>
                                                <Typography
                                                    variant="subtitle1"
                                                    component={Link}
                                                    href={`/game/${post.game.id}`}
                                                    sx={{
                                                        textDecoration: "none",
                                                        color: "inherit",
                                                    }}
                                                >
                                                    {post.game.title}
                                                </Typography>
                                            </Stack>
                                        </Stack>
                                        <Stack direction="row" spacing={2}>
                                            <Avatar
                                                src={post.author.iconURL}
                                                sx={{ width: 40, height: 40 }}
                                            />
                                            <Stack spacing={0.5}>
                                                {post.author.id ? (
                                                    <Typography
                                                        variant="subtitle1"
                                                        component={Link}
                                                        href={`/user/${post.author.id}`}
                                                        sx={{
                                                            textDecoration:
                                                                "none",
                                                            color: "inherit",
                                                        }}
                                                    >
                                                        {post.author.name}
                                                    </Typography>
                                                ) : (
                                                    <Typography variant="subtitle1">
                                                        {post.author.name}
                                                    </Typography>
                                                )}
                                                <Typography
                                                    variant="caption"
                                                    color="textSecondary"
                                                >
                                                    {formatDistance(
                                                        new Date(
                                                            post.createdAt,
                                                        ),
                                                        new Date(),
                                                        {
                                                            addSuffix: true,
                                                            locale: ja,
                                                        },
                                                    )}
                                                </Typography>
                                            </Stack>
                                        </Stack>
                                        <Typography
                                            variant="body1"
                                            sx={{ whiteSpace: "pre-wrap" }}
                                        >
                                            {post.body}
                                        </Typography>

                                        {post.reply ? (
                                            <>
                                                <Divider />
                                                <Stack
                                                    spacing={1}
                                                    sx={{
                                                        alignItems: "flex-end",
                                                        textAlign: "right",
                                                    }}
                                                >
                                                    <Stack
                                                        direction="row"
                                                        spacing={2}
                                                    >
                                                        <Stack spacing={0.5}>
                                                            {post.reply.author
                                                                .id ? (
                                                                <Typography
                                                                    variant="subtitle2"
                                                                    component={
                                                                        Link
                                                                    }
                                                                    href={`/user/${post.reply.author.id}`}
                                                                    sx={{
                                                                        textDecoration:
                                                                            "none",
                                                                        color: "inherit",
                                                                    }}
                                                                >
                                                                    {
                                                                        post
                                                                            .reply
                                                                            .author
                                                                            .name
                                                                    }
                                                                    （投稿者）
                                                                </Typography>
                                                            ) : (
                                                                <Typography variant="subtitle2">
                                                                    {
                                                                        post
                                                                            .reply
                                                                            .author
                                                                            .name
                                                                    }
                                                                    （投稿者）
                                                                </Typography>
                                                            )}
                                                            <Typography
                                                                variant="caption"
                                                                color="textSecondary"
                                                            >
                                                                {formatDistance(
                                                                    new Date(
                                                                        post
                                                                            .reply
                                                                            .createdAt,
                                                                    ),
                                                                    new Date(),
                                                                    {
                                                                        addSuffix: true,
                                                                        locale: ja,
                                                                    },
                                                                )}
                                                            </Typography>
                                                        </Stack>
                                                        <Avatar
                                                            src={
                                                                post.reply
                                                                    .author
                                                                    .iconURL
                                                            }
                                                            sx={{
                                                                width: 36,
                                                                height: 36,
                                                            }}
                                                        />
                                                    </Stack>
                                                    <Typography
                                                        variant="body2"
                                                        sx={{
                                                            whiteSpace:
                                                                "pre-wrap",
                                                        }}
                                                    >
                                                        {post.reply.body}
                                                    </Typography>
                                                </Stack>
                                            </>
                                        ) : showReplyForm ? (
                                            <>
                                                <Divider />
                                                <FeedbackReplyForm
                                                    postId={post.id}
                                                    onRefresh={onRefresh}
                                                />
                                            </>
                                        ) : (
                                            <Typography
                                                variant="body2"
                                                color="textSecondary"
                                            >
                                                返信待ち
                                            </Typography>
                                        )}
                                    </Stack>
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                    {!isEnd && (
                        <Button
                            startIcon={<ExpandMore />}
                            variant="outlined"
                            onClick={onLoadMore}
                        >
                            もっと読む
                        </Button>
                    )}
                </>
            )}
        </Stack>
    );
}
