"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
    Alert,
    Box,
    ButtonBase,
    Chip,
    CircularProgress,
    Collapse,
    IconButton,
    Paper,
    Stack,
    TextField,
    Typography,
    useTheme,
} from "@mui/material";
import {
    Forum,
    KeyboardArrowDown,
    KeyboardArrowUp,
    Send,
} from "@mui/icons-material";
import { formatDistance } from "date-fns";
import { ja } from "date-fns/locale";
import {
    BOARD_MESSAGE_BODY_MAX,
    BOARD_MESSAGE_NAME_MAX,
    BoardMessageInfo,
} from "@/lib/types";
import { useBoardMessages } from "@/lib/client/useBoardMessages";
import { useAuth } from "@/lib/client/useAuth";
import { STORAGE_KEYS, useLocalStorage } from "@/lib/client/useLocalStorage";
import {
    BoardMessageFormState,
    postBoardMessageAction,
} from "@/lib/server/board-message-post";
import { useMute } from "@/lib/client/useMute";
import { UserInline } from "./user-inline";
import { MutedMessage } from "./muted-message";
import { ModerationMenu } from "./moderation-menu";

const initialFormState: BoardMessageFormState = {
    ok: true,
    submitted: false,
};

// タッチターゲットとして確保する最小高さ
const COLLAPSED_BAR_MIN_HEIGHT = 48;

function MessageBody({ message }: { message: BoardMessageInfo }) {
    return (
        <Stack spacing={0.25}>
            <Stack
                direction="row"
                sx={{
                    alignItems: "center",
                    flexWrap: "wrap",
                    // spacing は margin-left で実装されるため、
                    // 折り返した 2 行目の先頭がインデントされてしまう
                    columnGap: 1,
                    rowGap: 0.25,
                }}
            >
                <UserInline
                    user={{
                        id: message.author.id,
                        name: message.author.name,
                        image: message.author.iconURL,
                    }}
                    avatarSize={20}
                    textVariant="subtitle2"
                />
                <Typography variant="caption" color="textSecondary">
                    {formatDistance(new Date(message.createdAt), new Date(), {
                        addSuffix: true,
                        locale: ja,
                    })}
                </Typography>
            </Stack>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {message.body}
            </Typography>
        </Stack>
    );
}

function MessageItem({
    message,
    mute,
}: {
    message: BoardMessageInfo;
    mute: ReturnType<typeof useMute>;
}) {
    if (mute.isMuted(message)) {
        return (
            <MutedMessage
                menu={
                    <ModerationMenu
                        message={message}
                        mute={mute}
                        source="board"
                    />
                }
            >
                <MessageBody message={message} />
            </MutedMessage>
        );
    }
    return (
        <Stack
            direction="row"
            sx={{ alignItems: "flex-start", columnGap: 0.5 }}
        >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <MessageBody message={message} />
            </Box>
            <ModerationMenu message={message} mute={mute} source="board" />
        </Stack>
    );
}

function SendButton({ disabled }: { disabled: boolean }) {
    const { pending } = useFormStatus();
    return (
        <IconButton
            type="submit"
            color="primary"
            aria-label="投稿"
            disabled={disabled || pending}
        >
            {pending ? <CircularProgress size={20} /> : <Send />}
        </IconButton>
    );
}

export function MessageBoard() {
    const theme = useTheme();
    const [user] = useAuth();
    const { isLoading, list, error, mutate } = useBoardMessages();
    const mute = useMute("board", mutate);
    const [expanded, setExpanded] = useState(false);
    const [body, setBody] = useState("");
    const [guestName, setGuestName] = useLocalStorage(
        STORAGE_KEYS.BOARD_AUTHOR_NAME,
        "",
    );
    const [state, formAction] = useActionState(
        postBoardMessageAction,
        initialFormState,
    );
    const listRef = useRef<HTMLDivElement>(null);

    const messages = list ?? [];
    // 折りたたみ時のプレビューにミュート対象を出すと、隠した意味がなくなる
    const latest = [...messages]
        .reverse()
        .find((message) => !mute.isMuted(message));
    const isOAuth = user?.authType === "oauth";

    useEffect(() => {
        if (expanded && listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [expanded, messages.length]);

    useEffect(() => {
        if (state.submitted && state.ok && state.submittedAt) {
            setBody("");
            mutate();
        }
    }, [state.submitted, state.ok, state.submittedAt, mutate]);

    return (
        // 通常フローでフッターの直前に置き、スクロール中のみ画面下端に張り付かせる。
        // 最下部までスクロールするとフッターが伝言板の下に現れる
        <Paper
            elevation={8}
            sx={{
                position: "sticky",
                bottom: 0,
                mt: "auto",
                mx: "auto",
                width: "100%",
                maxWidth: "sm",
                zIndex: theme.zIndex.appBar,
                borderRadius: 4,
                overflow: "hidden",
            }}
        >
            <ButtonBase
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                sx={{
                    width: "100%",
                    minHeight: COLLAPSED_BAR_MIN_HEIGHT,
                    px: { xs: 1.5, sm: 2 },
                    justifyContent: "flex-start",
                    textAlign: "left",
                }}
            >
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        alignItems: "center",
                        width: "100%",
                        minWidth: 0,
                    }}
                >
                    <Forum fontSize="small" color="primary" />
                    <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
                        伝言板
                    </Typography>
                    <Chip
                        size="small"
                        variant="outlined"
                        label={`${messages.length} 件`}
                    />
                    {!expanded && latest && (
                        <>
                            <Typography
                                variant="body2"
                                color="textSecondary"
                                noWrap
                                sx={{ minWidth: 0, flexGrow: 1 }}
                            >
                                {latest.author.name}: {latest.body}
                            </Typography>
                            <Typography
                                variant="caption"
                                color="textSecondary"
                                sx={{ flexShrink: 0 }}
                            >
                                {formatDistance(
                                    new Date(latest.createdAt),
                                    new Date(),
                                    { addSuffix: true, locale: ja },
                                )}
                            </Typography>
                        </>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    {expanded ? (
                        <KeyboardArrowDown fontSize="small" />
                    ) : (
                        <KeyboardArrowUp fontSize="small" />
                    )}
                </Stack>
            </ButtonBase>
            <Collapse in={expanded}>
                <Stack
                    spacing={1}
                    sx={{
                        px: { xs: 1.5, sm: 2 },
                        pb: { xs: 1.5, sm: 2 },
                    }}
                >
                    <Typography variant="caption" color="textSecondary">
                        ちょっとした連絡用に。投稿は一定時間で消えます。
                    </Typography>
                    <Box
                        ref={listRef}
                        sx={{
                            overflowY: "auto",
                            maxHeight: { xs: "30vh", sm: "35vh" },
                        }}
                    >
                        {isLoading ? (
                            <Stack sx={{ alignItems: "center", py: 2 }}>
                                <CircularProgress size={24} />
                            </Stack>
                        ) : error ? (
                            <Alert variant="outlined" severity="error">
                                {error}
                            </Alert>
                        ) : messages.length === 0 ? (
                            <Typography
                                variant="body2"
                                color="textSecondary"
                                sx={{ py: 1 }}
                            >
                                まだ投稿はありません。
                            </Typography>
                        ) : (
                            <Stack spacing={1.5} sx={{ py: 0.5 }}>
                                {messages.map((message) => (
                                    <MessageItem
                                        key={message.id}
                                        message={message}
                                        mute={mute}
                                    />
                                ))}
                            </Stack>
                        )}
                    </Box>
                    {!state.ok && state.submitted && (
                        <Alert severity="warning" variant="outlined">
                            {state.message}
                        </Alert>
                    )}
                    {mute.error && (
                        <Alert
                            severity="warning"
                            variant="outlined"
                            onClose={mute.clearError}
                        >
                            {mute.error}
                        </Alert>
                    )}
                    <Stack
                        component="form"
                        action={formAction}
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        sx={{ alignItems: { sm: "center" } }}
                    >
                        {isOAuth ? (
                            <Box
                                sx={{
                                    flexShrink: 0,
                                    whiteSpace: "nowrap",
                                    maxWidth: { sm: 160, md: 240 },
                                    overflow: "hidden",
                                }}
                            >
                                <UserInline
                                    user={{
                                        name: user.name,
                                        image: user.image,
                                    }}
                                    avatarSize={24}
                                />
                            </Box>
                        ) : (
                            <TextField
                                size="small"
                                label="名前"
                                name="authorName"
                                placeholder="ゲスト"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                slotProps={{
                                    htmlInput: {
                                        maxLength: BOARD_MESSAGE_NAME_MAX,
                                    },
                                }}
                                sx={{
                                    width: { xs: "100%", sm: 160 },
                                    flexShrink: 0,
                                }}
                            />
                        )}
                        <Stack
                            direction="row"
                            spacing={1}
                            sx={{
                                alignItems: "center",
                                flexGrow: 1,
                                width: "100%",
                            }}
                        >
                            <TextField
                                size="small"
                                fullWidth
                                name="body"
                                placeholder="メッセージを入力"
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                slotProps={{
                                    htmlInput: {
                                        maxLength: BOARD_MESSAGE_BODY_MAX,
                                    },
                                }}
                            />
                            <SendButton disabled={!body.trim()} />
                        </Stack>
                    </Stack>
                </Stack>
            </Collapse>
        </Paper>
    );
}
