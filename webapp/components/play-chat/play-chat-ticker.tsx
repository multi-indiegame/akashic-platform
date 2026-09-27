"use client";

import {
    memo,
    RefObject,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import {
    alpha,
    Avatar,
    Box,
    Container,
    IconButton,
    Tooltip,
    Typography,
    useTheme,
} from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { PlayChatMessageInfo } from "@/lib/types";
import { usePlayChatContext } from "@/lib/client/usePlayChatContext";
import { useMute } from "@/lib/client/useMute";
import { PlayChatHistory } from "./play-chat-history";
import { PlayChatToast } from "./play-chat-toast";
import { TitleBadges } from "../title-badges";

const ROW_HEIGHT = 34;
const SPEED_PX_PER_SEC = 140;
const GAP_PX = 56;

type FlowingItem = {
    key: string;
    message: PlayChatMessageInfo;
    startedAt: number;
    durationMs?: number;
};

const FlowingComment = memo(function FlowingComment({
    item,
    trackWidth,
    onMeasured,
}: {
    item: FlowingItem;
    trackWidth: number;
    onMeasured: (key: string, width: number) => void;
}) {
    const theme = useTheme();
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState<number>();

    // 幅が分からないと所要時間を決められないため、描画前に実測する。
    // useLayoutEffect なので測定中の非表示状態は画面に出ない
    useLayoutEffect(() => {
        const measured = ref.current?.getBoundingClientRect().width ?? 0;
        setWidth(measured);
        onMeasured(item.key, measured);
    }, [item.key, onMeasured]);

    const durationMs =
        width == null ? 0 : ((trackWidth + width) / SPEED_PX_PER_SEC) * 1000;

    return (
        <Box
            ref={ref}
            sx={{
                position: "absolute",
                top: 0,
                left: trackWidth,
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                height: ROW_HEIGHT,
                whiteSpace: "nowrap",
                willChange: "transform",
                textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                visibility: width == null ? "hidden" : "visible",
                ...(width != null && {
                    animation: `play-chat-flow ${durationMs}ms linear forwards`,
                }),
                "@keyframes play-chat-flow": {
                    from: { transform: "translateX(0)" },
                    to: {
                        transform: `translateX(calc(-${trackWidth}px - 100%))`,
                    },
                },
            }}
        >
            {item.message.author.iconURL && (
                <Avatar
                    src={item.message.author.iconURL}
                    sx={{ width: 24, height: 24 }}
                />
            )}
            <Typography
                variant="body1"
                sx={{
                    color: theme.palette.primary.light,
                    fontWeight: "medium",
                }}
            >
                {item.message.author.name}
            </Typography>
            {item.message.titles && item.message.titles.length > 0 && (
                <TitleBadges
                    titles={item.message.titles}
                    variant="compact"
                    iconSize={24}
                    disableDetail
                />
            )}
            <Typography variant="body1" sx={{ color: "#fff" }}>
                {item.message.body}
            </Typography>
        </Box>
    );
});

/**
 * 1 行に収まるよう、先行コメントが右端を空けるまで後続をキューに待たせる。
 */
function useCommentQueue(
    trackRef: RefObject<HTMLDivElement | null>,
    trackWidth: number,
) {
    const { incoming, consumeIncoming } = usePlayChatContext();
    const mute = useMute("chat");
    // useMute は毎レンダー新しいオブジェクトを返すため、effect の依存にすると
    // 毎回張り替わってしまう。最新の判定関数を ref で持ち、200ms ループから読む
    const muteRef = useRef(mute);
    muteRef.current = mute;
    const queueRef = useRef<PlayChatMessageInfo[]>([]);
    const [flowing, setFlowing] = useState<FlowingItem[]>([]);

    useEffect(() => {
        if (incoming.length === 0) {
            return;
        }
        // ミュート対象は画面上を流さない。流れてしまうと隠せないから
        queueRef.current.push(
            ...incoming.filter((message) => !mute.isMuted(message)),
        );
        consumeIncoming(incoming[incoming.length - 1].id);
    }, [incoming, consumeIncoming, mute]);

    const handleMeasured = useCallback(
        (key: string, width: number) => {
            const durationMs = ((trackWidth + width) / SPEED_PX_PER_SEC) * 1000;
            setFlowing((prev) =>
                prev.map((item) =>
                    item.key === key ? { ...item, durationMs } : item,
                ),
            );
        },
        [trackWidth],
    );

    useEffect(() => {
        if (trackWidth <= 0) {
            return;
        }
        const intervalId = setInterval(() => {
            const now = Date.now();
            // 表示終了に加え、流れている最中にミュートされた分もここで落とす
            setFlowing((prev) =>
                prev.filter(
                    (item) =>
                        !muteRef.current.isMuted(item.message) &&
                        (item.durationMs == null ||
                            now < item.startedAt + item.durationMs),
                ),
            );
            const track = trackRef.current;
            if (!track || queueRef.current.length === 0) {
                return;
            }
            const last = track.lastElementChild;
            if (last) {
                if (getComputedStyle(last).visibility === "hidden") {
                    // 幅の実測待ち。まだ動き出していない
                    return;
                }
                const trackRight = track.getBoundingClientRect().right;
                if (last.getBoundingClientRect().right > trackRight - GAP_PX) {
                    return;
                }
            }
            // 待機中にミュートされた分は表示せず読み飛ばす。列に空きを取らせない
            // ので、先頭に溜まったミュート対象はまとめて捨ててよい
            let next: PlayChatMessageInfo | undefined;
            while ((next = queueRef.current.shift())) {
                if (!muteRef.current.isMuted(next)) {
                    break;
                }
            }
            if (!next) {
                return;
            }
            setFlowing((prev) => [
                ...prev,
                { key: `${next.id}-${now}`, message: next, startedAt: now },
            ]);
        }, 200);
        return () => clearInterval(intervalId);
    }, [trackWidth, trackRef]);

    return { flowing, handleMeasured };
}

export function PlayChatTicker() {
    const theme = useTheme();
    const { fullscreen, messages } = usePlayChatContext();
    const [expanded, setExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [trackWidth, setTrackWidth] = useState(0);
    const { flowing, handleMeasured } = useCommentQueue(trackRef, trackWidth);

    useEffect(() => {
        function measure() {
            if (trackRef.current) {
                setTrackWidth(trackRef.current.getBoundingClientRect().width);
            }
        }
        measure();
        window.addEventListener("resize", measure);
        window.addEventListener("orientationchange", measure);
        return () => {
            window.removeEventListener("resize", measure);
            window.removeEventListener("orientationchange", measure);
        };
    }, [fullscreen]);

    return (
        <Container
            ref={containerRef}
            component="div"
            disableGutters
            sx={{ maxWidth: fullscreen ? "none" : undefined, flexShrink: 0 }}
        >
            <Box
                sx={{
                    position: "relative",
                    display: "flex",
                    alignItems: "stretch",
                    backgroundColor: alpha("#000", fullscreen ? 0.55 : 0.75),
                    borderTopLeftRadius: fullscreen
                        ? 0
                        : theme.shape.borderRadius,
                    borderTopRightRadius: fullscreen
                        ? 0
                        : theme.shape.borderRadius,
                }}
            >
                <Box
                    ref={trackRef}
                    aria-live="polite"
                    sx={{
                        position: "relative",
                        overflow: "hidden",
                        flexGrow: 1,
                        // コメントの有無でレイアウトが動かないよう高さを固定する
                        height: ROW_HEIGHT,
                    }}
                >
                    {trackWidth > 0 &&
                        flowing.map((item) => (
                            <FlowingComment
                                key={item.key}
                                item={item}
                                trackWidth={trackWidth}
                                onMeasured={handleMeasured}
                            />
                        ))}
                </Box>
                <Tooltip
                    arrow
                    title={expanded ? "過去ログを閉じる" : "過去ログを見る"}
                    slotProps={{ popper: { disablePortal: true } }}
                >
                    <IconButton
                        size="small"
                        onClick={() => setExpanded((prev) => !prev)}
                        aria-expanded={expanded}
                        aria-label={
                            expanded ? "過去ログを閉じる" : "過去ログを見る"
                        }
                        sx={{ color: "#fff", alignSelf: "center", mx: 0.5 }}
                    >
                        {expanded ? (
                            <KeyboardArrowUp fontSize="small" />
                        ) : (
                            <KeyboardArrowDown fontSize="small" />
                        )}
                    </IconButton>
                </Tooltip>
            </Box>
            {expanded && <PlayChatHistory messages={messages} />}
            <PlayChatToast anchorRef={containerRef} />
        </Container>
    );
}
