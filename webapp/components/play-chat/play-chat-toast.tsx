"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import {
    alpha,
    Alert,
    Avatar,
    Snackbar,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { ChatBubble } from "@mui/icons-material";
import { PlayChatMessageInfo } from "@/lib/types";
import { usePlayChatContext } from "@/lib/client/usePlayChatContext";
import { useMute } from "@/lib/client/useMute";

// ヘッダーは sticky でページに重なるため、その下端より下を可視領域とみなす
function getVisibleTop() {
    return (
        document.querySelector("header")?.getBoundingClientRect().bottom ?? 0
    );
}

function isVisible(el: HTMLElement | null) {
    if (!el) {
        return true;
    }
    const rect = el.getBoundingClientRect();
    return rect.bottom > getVisibleTop() && rect.top < window.innerHeight;
}

export function PlayChatToast({
    anchorRef,
}: {
    anchorRef: RefObject<HTMLElement | null>;
}) {
    const { messages, isLoading, fullscreen } = usePlayChatContext();
    const theme = useTheme();
    const mute = useMute("chat");
    const lastIdRef = useRef<number | undefined>(undefined);
    const [toast, setToast] = useState<PlayChatMessageInfo>();

    useEffect(() => {
        if (isLoading) {
            return;
        }
        const lastId = lastIdRef.current;
        if (messages.length > 0) {
            lastIdRef.current = messages[messages.length - 1].id;
        } else if (lastId == null) {
            lastIdRef.current = 0;
        }
        // 初回取得分は入室前の投稿なので通知しない
        if (lastId == null || fullscreen || isVisible(anchorRef.current)) {
            return;
        }
        const notifiable = messages.filter(
            (m) => m.id > lastId && !m.author.isSelf && !mute.isMuted(m),
        );
        if (notifiable.length > 0) {
            setToast(notifiable[notifiable.length - 1]);
        }
    }, [messages, isLoading, fullscreen, anchorRef, mute]);

    useEffect(() => {
        if (!toast) {
            return;
        }
        function handleScroll() {
            if (isVisible(anchorRef.current)) {
                setToast(undefined);
            }
        }
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [toast, anchorRef]);

    function handleClick() {
        const el = anchorRef.current;
        if (el) {
            window.scrollBy({
                top: el.getBoundingClientRect().top - getVisibleTop(),
                behavior: "smooth",
            });
        }
        setToast(undefined);
    }

    if (!toast) {
        return null;
    }
    return (
        <Snackbar
            // 続けて届いたときに表示時間をリセットするため、投稿ごとに作り直す
            key={toast.id}
            open={!fullscreen}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            autoHideDuration={5000}
            onClose={() => setToast(undefined)}
        >
            <Alert
                variant="filled"
                severity="info"
                icon={
                    toast.author.iconURL ? (
                        <Avatar
                            src={toast.author.iconURL}
                            sx={{ width: 32, height: 32 }}
                        />
                    ) : (
                        <ChatBubble fontSize="inherit" />
                    )
                }
                role="button"
                aria-label="部屋チャットを表示"
                onClick={handleClick}
                sx={{
                    color: "inherit",
                    cursor: "pointer",
                    alignItems: "center",
                    width: { xs: "100%", sm: 360 },
                    "& .MuiAlert-message": { minWidth: 0, flexGrow: 1 },
                }}
            >
                <Stack spacing={0.25}>
                    <Typography variant="subtitle2" noWrap>
                        {toast.author.name}
                    </Typography>
                    <Typography variant="body2" noWrap>
                        {toast.body}
                    </Typography>
                </Stack>
            </Alert>
        </Snackbar>
    );
}
