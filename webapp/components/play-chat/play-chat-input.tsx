"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
    alpha,
    Alert,
    Box,
    ButtonBase,
    CircularProgress,
    Container,
    IconButton,
    Stack,
    TextField,
    Tooltip,
    Typography,
    useTheme,
} from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowUp, Send } from "@mui/icons-material";
import { PLAY_CHAT_BODY_MAX, PLAY_CHAT_NAME_MAX } from "@/lib/types";
import { useAuth } from "@/lib/client/useAuth";
import { STORAGE_KEYS, useLocalStorage } from "@/lib/client/useLocalStorage";
import { usePlayChatContext } from "@/lib/client/usePlayChatContext";
import {
    PlayChatFormState,
    postPlayChatAction,
} from "@/lib/server/play-chat-post";
import { UserInline } from "../user-inline";

const initialFormState: PlayChatFormState = {
    ok: true,
    submitted: false,
};

function SendButton({ disabled }: { disabled: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Tooltip
            arrow
            title="コメントを送信"
            slotProps={{ popper: { disablePortal: true } }}
        >
            <span>
                <IconButton
                    type="submit"
                    color="primary"
                    aria-label="コメントを送信"
                    disabled={disabled || pending}
                >
                    {pending ? <CircularProgress size={20} /> : <Send />}
                </IconButton>
            </span>
        </Tooltip>
    );
}

function CollapseTab({
    collapsed,
    onToggle,
}: {
    collapsed: boolean;
    onToggle: () => void;
}) {
    const theme = useTheme();
    const label = collapsed ? "コメント入力欄を開く" : "コメント入力欄を閉じる";
    return (
        <Box
            sx={{
                // 入力欄の高さを増やさないよう、ゲーム画面の下端に重ねる
                position: "absolute",
                bottom: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1,
            }}
        >
            <ButtonBase
                onClick={onToggle}
                aria-expanded={!collapsed}
                aria-controls="play-chat-input-panel"
                aria-label={label}
                sx={{
                    height: 20,
                    px: 1.5,
                    gap: 0.25,
                    color: "#fff",
                    backgroundColor: alpha("#000", 0.55),
                    borderTopLeftRadius: theme.shape.borderRadius,
                    borderTopRightRadius: theme.shape.borderRadius,
                    "&:hover": { backgroundColor: alpha("#000", 0.75) },
                }}
            >
                {collapsed ? (
                    <KeyboardArrowUp fontSize="small" />
                ) : (
                    <KeyboardArrowDown fontSize="small" />
                )}
                <Typography variant="caption">コメント</Typography>
            </ButtonBase>
        </Box>
    );
}

export function PlayChatInput() {
    const theme = useTheme();
    const [user] = useAuth();
    const { playId, fullscreen, refresh, playerName, setPlayerName } =
        usePlayChatContext();
    const [body, setBody] = useState("");
    const [collapsed, setCollapsed] = useLocalStorage(
        STORAGE_KEYS.PLAY_CHAT_INPUT_COLLAPSED,
        false,
    );
    const [state, formAction] = useActionState(
        postPlayChatAction,
        initialFormState,
    );

    const isOAuth = user?.authType === "oauth";

    useEffect(() => {
        if (state.submitted && state.ok && state.submittedAt) {
            setBody("");
            void refresh();
        }
    }, [state.submitted, state.ok, state.submittedAt, refresh]);

    return (
        <Container
            component="div"
            disableGutters
            sx={{
                maxWidth: fullscreen ? "none" : undefined,
                flexShrink: 0,
                position: "relative",
            }}
        >
            {fullscreen && (
                <CollapseTab
                    collapsed={collapsed}
                    onToggle={() => setCollapsed(!collapsed)}
                />
            )}
            <Stack
                id="play-chat-input-panel"
                spacing={0.5}
                sx={{
                    display: fullscreen && collapsed ? "none" : undefined,
                    backgroundColor: fullscreen
                        ? alpha("#000", 0.55)
                        : theme.palette.background.paper,
                    px: { xs: 1, sm: 1.5 },
                    py: 1,
                    borderBottomLeftRadius: fullscreen
                        ? 0
                        : theme.shape.borderRadius,
                    borderBottomRightRadius: fullscreen
                        ? 0
                        : theme.shape.borderRadius,
                }}
            >
                {!state.ok && state.submitted && (
                    <Alert severity="warning" variant="outlined">
                        {state.message}
                    </Alert>
                )}
                <Stack
                    component="form"
                    action={formAction}
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                >
                    <input type="hidden" name="playId" value={playId} />
                    {isOAuth ? (
                        <Box
                            sx={{
                                flexShrink: 0,
                                whiteSpace: "nowrap",
                                maxWidth: { xs: 96, sm: 160 },
                                overflow: "hidden",
                            }}
                        >
                            <UserInline
                                user={{ name: user.name, image: user.image }}
                                avatarSize={24}
                            />
                        </Box>
                    ) : (
                        <TextField
                            size="small"
                            name="authorName"
                            placeholder="名前"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            slotProps={{
                                htmlInput: { maxLength: PLAY_CHAT_NAME_MAX },
                            }}
                            sx={{ width: { xs: 96, sm: 140 }, flexShrink: 0 }}
                        />
                    )}
                    <TextField
                        size="small"
                        fullWidth
                        name="body"
                        placeholder="コメントを入力"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        slotProps={{
                            htmlInput: { maxLength: PLAY_CHAT_BODY_MAX },
                        }}
                    />
                    <SendButton disabled={!body.trim()} />
                </Stack>
            </Stack>
        </Container>
    );
}
