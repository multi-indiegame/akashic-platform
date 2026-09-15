"use client";

import {
    RefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
    Alert,
    alpha,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Container,
    Divider,
    IconButton,
    Slider,
    Snackbar,
    Stack,
    Tooltip,
    Typography,
    useTheme,
} from "@mui/material";
import {
    Fullscreen,
    FullscreenExit,
    HelpOutlined,
    Lock,
    NoAccounts,
    OpenInNew,
    PhotoCamera,
    SpeakerNotesOff,
    Videocam,
    VideocamOff,
    VolumeOff,
    VolumeUp,
    X,
} from "@mui/icons-material";
import type { PlayEndReason } from "@yasshi2525/amflow-client-event-schema";
import { BAN_IN_GAME_CONFIRM_PENDING_MAX, GameInfo, User } from "@/lib/types";
import { useAkashic } from "@/lib/client/useAkashic";
import { useCustomData } from "@/lib/client/useCustomData";
import { usePlayLeaveGuard } from "@/lib/client/usePlayLeaveGuard";
import { STORAGE_KEYS, useLocalStorage } from "@/lib/client/useLocalStorage";
import { ResolvingPlayerInfoRequest } from "@/lib/client/akashic-plugins/coe-limited-plugin";
import { AkashicContainer } from "@/lib/client/akashic-container";
import type {
    BanResult,
    BanResultReason,
    PlayerBanBackend,
} from "@multi-indiegame/akashic-player-ban-plugin";
import { useCopyToClipboard } from "@/lib/client/useCopyToClipboard";
import { extendPlay } from "@/lib/server/play-extend";
import { banPlayerInGameAction } from "@/lib/server/ban-in-game-action";
import { uploadPlayShareScreenshot } from "@/lib/server/play-share";
import { PlayBanConfirmDialog } from "./play-ban-confirm-dialog";
import { PlayCloseDialog } from "./play-close-dialog";
import { PlayLeaveDialog } from "./play-leave-dialog";
import { PlayEndNotification } from "./play-end-notification";
import { PlayPlayerInfoResolver } from "./play-player-info-resolver";
import { CreditPanel } from "./credit-panel";
import { UserInline } from "./user-inline";
import { ClientLogDialog } from "./client-log-dialog";
import { TroubleshootButton } from "./troubleshoot-button";
import { FavoriteButton } from "./favorite-button";
import { renderTextWithLinks } from "./text-with-links";
import { HandleSetDialog } from "./handle-set-dialog";
import { ReportMenu } from "./report-menu";
import { CopyLinkBox, CopyStatusSnackbar } from "./copy-link-box";
import { PlayChatProvider } from "./play-chat/play-chat-provider";
import { PlayChatTicker } from "./play-chat/play-chat-ticker";
import { PlayChatInput } from "./play-chat/play-chat-input";

const warnings = ["EVENT_ON_SKIPPING"] as const;
type WarningType = (typeof warnings)[number];

const MASTER_VOLUME_MAX = 0.4;

const extensionReminderTypes = ["INFO", "WARN"] as const;
type ExtensionReminderType = (typeof extensionReminderTypes)[number];
const extensionReminderThresholds = {
    INFO: 5 * 60 * 1000,
    WARN: 2 * 60 * 1000,
} satisfies Record<ExtensionReminderType, number>;

const toMessage = (typ?: WarningType) => {
    if (!typ) {
        return undefined;
    }
    switch (typ) {
        case "EVENT_ON_SKIPPING":
            return "同期中です。しばらくお待ち下さい。";
        default:
            return "予期しないエラーが発生しました。時間をおいてリトライしてください。";
    }
};

const toBanErrorMessage = (reason: BanResultReason) => {
    switch (reason) {
        case "PlayerNotFound":
            return "対象がこの部屋にいないためBANできませんでした。";
        case "SelfBan":
            return "自分自身はBANできません。";
        case "LimitExceeded":
            return "BANの要求が多すぎます。しばらく待ってから再度お試しください。";
        case "Unauthorized":
            return "この部屋の部屋主のみがBANできます。";
        default:
            return "予期しないエラーが発生しました。時間をおいてリトライしてください。";
    }
};

// 次の理由によりシングルトンにしている
// 破棄に Promise が必要 → useEffect 内で破棄が完了しない
// 同時に2インスタンス存在するとロードがとまり、破棄に必要なステップを踏めない
const container = new AkashicContainer();
const EXTEND_WINDOW_MS = 10 * 60 * 1000;

export function PlayView({
    playId,
    playToken,
    playerId,
    playName,
    isLimited,
    requireSignIn,
    chatEnabled,
    joinWord,
    inviteHash,
    game,
    gameMaster,
    isGameMaster,
    contentWidth,
    contentHeight,
    contentExternal,
    createdAt,
    remainingMs: initialRemainingMs,
    expiresAt: initialExpiresAt,
    user,
    onPlayEnd,
    afterPlayClose,
    afterRecreate,
    pageType,
    ref,
}: {
    playId: string;
    playToken: string;
    playerId: string;
    playName: string | null;
    isLimited: boolean;
    requireSignIn: boolean;
    chatEnabled: boolean;
    joinWord?: string;
    inviteHash?: string;
    game: GameInfo;
    gameMaster: {
        userId?: string;
        name: string;
        iconURL?: string;
        handle?: string;
    };
    isGameMaster: boolean;
    contentWidth: number;
    contentHeight: number;
    contentExternal: string[];
    createdAt: Date;
    remainingMs: number;
    expiresAt: number;
    user: User;
    onPlayEnd?: (reason: PlayEndReason) => void;
    afterPlayClose: { action: "redirect" } | { action: "stay"; cb: () => void };
    afterRecreate: { action: "navigate" } | { action: "stay"; cb: () => void };
    pageType: "play" | "live";
    ref: RefObject<HTMLDivElement | null>;
}) {
    const theme = useTheme();
    const { playlogServerUrl } = useAkashic();
    const { niconicommonsWorkUrl, clientLogCacheMaxEntries } = useCustomData();
    useEffect(() => {
        container.setClientLogMaxEntries(clientLogCacheMaxEntries);
    }, [clientLogCacheMaxEntries]);
    const [skipping, setSkipping] = useState(false);
    const [warning, setWarning] = useState<WarningType>();
    const [error, setError] = useState<string>();
    const [playEndReason, setPlayEndReason] = useState<PlayEndReason>();
    const leaveGuard = usePlayLeaveGuard({
        playId,
        enabled: isGameMaster && playEndReason == null,
    });
    const [requestPlayerInfo, setRequestPlayerInfo] =
        useState<ResolvingPlayerInfoRequest>();
    const [playerName, setPlayerName] = useLocalStorage(
        STORAGE_KEYS.PLAYER_INFO_NAME,
        "",
    );
    const [expiresAt, setExpiresAt] = useState<number | undefined>(
        initialExpiresAt,
    );
    const [remainingMs, setRemainingMs] = useState<number | undefined>(
        initialRemainingMs,
    );
    const [extendError, setExtendError] = useState<string>();
    const [extendLoading, setExtendLoading] = useState(false);
    const [extensionReminderType, setExtensionReminderType] =
        useState<ExtensionReminderType>();
    const shownReminders = useRef(new Set<ExtensionReminderType>());
    const [inviteUrl, setInviteUrl] = useState<string>();
    const {
        copyStatus: inviteCopyStatus,
        copy: copyInviteUrl,
        clearCopyStatus: clearInviteCopyStatus,
    } = useCopyToClipboard();
    const [handle, setHandle] = useState(gameMaster.handle);
    const [liveUrl, setLiveUrl] = useState<string>();
    const {
        copyStatus: liveCopyStatus,
        copy: copyLiveUrl,
        clearCopyStatus: clearLiveCopyStatus,
    } = useCopyToClipboard();
    const [handleDialogOpen, setHandleDialogOpen] = useState(false);
    const [volumePercent, setVolumePercent] = useLocalStorage(
        STORAGE_KEYS.PLAYER_VOLUME,
        100,
    );
    const [isMuted, setIsMuted] = useLocalStorage(
        STORAGE_KEYS.PLAYER_MUTED,
        false,
    );
    const [prevVolumePercent, setPrevVolumePercent] = useLocalStorage(
        STORAGE_KEYS.PLAYER_PREV_VOLUME,
        100,
    );
    const [screenshotStatus, setScreenshotStatus] = useState<
        "shared" | "downloaded" | "error" | "cancel"
    >();
    const [xShareStatus, setXShareStatus] = useState<"shared" | "error">();
    const [isXSharing, setIsXSharing] = useState(false);
    const [troubleshootOpen, setTroubleshootOpen] = useState(false);
    const [lastSubmittedComment, setLastSubmittedComment] = useState("");
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const gameAreaRef = useRef<HTMLDivElement>(null);
    const [fullscreenOn, setFullscreenOn] = useState(false);
    // ネイティブ全画面を要求したか（ESC や端末操作での解除をオーバーレイに反映するため）
    const nativeFullscreenRequestedRef = useRef(false);
    const [fullscreenViewport, setFullscreenViewport] = useState<{
        width: number;
        height: number;
    } | null>(null);
    const [fullscreenGuideOpen, setFullscreenGuideOpen] = useState(false);

    // コンテンツは同一オリジンなのでこの確認自体は迂回できるが、事故防止と
    // 可視化のために BAN 要求ごとに必ず出す
    const banConfirmQueue = useRef<((accepted: boolean) => void)[]>([]);
    const [banConfirmPending, setBanConfirmPending] = useState(0);
    // 同じ相手への要求を毎 tick 投げるようなゲームで、確認もサーバー呼び出しも
    // 相手ごとに 1 回に保つ
    const inFlightBans = useRef(new Map<string, Promise<BanResult>>());
    const [banNotice, setBanNotice] = useState<string>();
    const [banError, setBanError] = useState<string>();

    const confirmBan = useCallback(() => {
        const queue = banConfirmQueue.current;
        // サーバーの連打窓は確認の後にしか効かないため、確認待ちはここで押さえる
        if (queue.length >= BAN_IN_GAME_CONFIRM_PENDING_MAX) {
            return undefined;
        }
        return new Promise<boolean>((resolve) => {
            queue.push(resolve);
            setBanConfirmPending(queue.length);
        });
    }, []);

    const resolveBanConfirm = useCallback((accepted: boolean) => {
        const resolve = banConfirmQueue.current.shift();
        setBanConfirmPending(banConfirmQueue.current.length);
        resolve?.(accepted);
    }, []);

    const executeBanRequest = useCallback(
        async (targetPlayerId: string): Promise<BanResult> => {
            setBanError(undefined);
            // 部屋主でないインスタンスはサーバーへ投げない。ただしこれは通信を
            // 減らすためで、発行元の判定はサーバー側でも必ず行う
            if (!isGameMaster) {
                return {
                    ok: false,
                    playerId: targetPlayerId,
                    reason: "Unauthorized",
                };
            }
            const confirmation = confirmBan();
            if (!confirmation) {
                setBanError(toBanErrorMessage("LimitExceeded"));
                return {
                    ok: false,
                    playerId: targetPlayerId,
                    reason: "LimitExceeded",
                };
            }
            if (!(await confirmation)) {
                return {
                    ok: false,
                    playerId: targetPlayerId,
                    reason: "UserCancel",
                };
            }
            const res = await banPlayerInGameAction(
                parseInt(playId),
                targetPlayerId,
            );
            if (!res.ok) {
                setBanError(toBanErrorMessage(res.reason));
                return {
                    ok: false,
                    playerId: targetPlayerId,
                    reason: res.reason,
                };
            }
            setBanNotice(`${res.label} さんをBANしました。`);
            return { ok: true, playerId: targetPlayerId };
        },
        [playId, isGameMaster, confirmBan],
    );

    const sendBanRequest = useCallback(
        (targetPlayerId: string): Promise<BanResult> => {
            const inFlight = inFlightBans.current.get(targetPlayerId);
            if (inFlight) {
                return inFlight;
            }
            const request = executeBanRequest(targetPlayerId).finally(() => {
                inFlightBans.current.delete(targetPlayerId);
            });
            inFlightBans.current.set(targetPlayerId, request);
            return request;
        },
        [executeBanRequest],
    );

    const playerBanBackend = useMemo<PlayerBanBackend>(
        () => ({ ban: sendBanRequest }),
        [sendBanRequest],
    );

    function formatRemaining(ms: number | undefined) {
        if (ms == null) {
            return "--:--";
        }
        const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    function formatCreatedAt() {
        try {
            return format(new Date(createdAt), "yyyy/MM/dd HH:mm");
        } catch {
            return "--";
        }
    }

    function handleClose() {
        setWarning(undefined);
    }

    // ネイティブ全画面が ESC や端末操作で解除されたら、オーバーレイ表示も解除する
    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }
        function syncFullscreen() {
            const doc = document as Document & {
                webkitFullscreenElement?: Element | null;
            };
            const active = !!(
                doc.fullscreenElement ?? doc.webkitFullscreenElement
            );
            if (!active && nativeFullscreenRequestedRef.current) {
                nativeFullscreenRequestedRef.current = false;
                setFullscreenOn(false);
            }
        }
        document.addEventListener("fullscreenchange", syncFullscreen);
        document.addEventListener("webkitfullscreenchange", syncFullscreen);
        return () => {
            document.removeEventListener("fullscreenchange", syncFullscreen);
            document.removeEventListener(
                "webkitfullscreenchange",
                syncFullscreen,
            );
            // アンマウント時にネイティブ全画面を解除する。
            // 全画面要素は document.documentElement のため
            if (nativeFullscreenRequestedRef.current) {
                nativeFullscreenRequestedRef.current = false;
                const doc = document as Document & {
                    webkitFullscreenElement?: Element | null;
                    webkitExitFullscreen?: () => Promise<void> | void;
                };
                const nativeActive =
                    doc.fullscreenElement ?? doc.webkitFullscreenElement;
                if (nativeActive) {
                    try {
                        if (doc.exitFullscreen) {
                            void doc.exitFullscreen();
                        } else if (doc.webkitExitFullscreen) {
                            void doc.webkitExitFullscreen();
                        }
                    } catch (err) {
                        console.warn("failed to exit fullscreen", err);
                    }
                }
            }
        };
    }, []);

    async function handleToggleFullscreen() {
        const doc = document as Document & {
            webkitFullscreenElement?: Element | null;
            webkitExitFullscreen?: () => Promise<void> | void;
        };
        // 全画面を解除する
        if (fullscreenOn) {
            setFullscreenOn(false);
            nativeFullscreenRequestedRef.current = false;
            const nativeActive =
                doc.fullscreenElement ?? doc.webkitFullscreenElement;
            if (nativeActive) {
                try {
                    if (doc.exitFullscreen) {
                        await doc.exitFullscreen();
                    } else if (doc.webkitExitFullscreen) {
                        await doc.webkitExitFullscreen();
                    }
                } catch (err) {
                    console.warn("failed to exit fullscreen", err);
                }
            }
            return;
        }
        // 全画面にする。CSS オーバーレイは常に適用し、加えてブラウザのツールバーを
        // 隠すため <html> をネイティブ全画面にする（body 配下のモーダルも全画面内に表示される）
        setFullscreenOn(true);
        const el = document.documentElement as HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void> | void;
        };
        try {
            if (el.requestFullscreen) {
                nativeFullscreenRequestedRef.current = true;
                await el.requestFullscreen();
            } else if (el.webkitRequestFullscreen) {
                nativeFullscreenRequestedRef.current = true;
                await el.webkitRequestFullscreen();
            }
        } catch (err) {
            // ネイティブ全画面が拒否されても CSS オーバーレイで全画面表示は維持する
            nativeFullscreenRequestedRef.current = false;
            console.warn("failed to enter native fullscreen", err);
        }
    }

    // 全画面表示領域のサイズを計測し、終了ガイドの吹き出しを一定時間表示する
    useEffect(() => {
        if (!fullscreenOn) {
            setFullscreenViewport(null);
            setFullscreenGuideOpen(false);
            return;
        }
        function measure() {
            // チャット帯を除いた、実際にゲームが描画される領域を測る
            const el = gameAreaRef.current;
            if (el) {
                const rect = el.getBoundingClientRect();
                setFullscreenViewport({
                    width: rect.width,
                    height: rect.height,
                });
            }
        }
        measure();
        setFullscreenGuideOpen(true);
        const timer = setTimeout(() => setFullscreenGuideOpen(false), 5000);
        window.addEventListener("resize", measure);
        window.addEventListener("orientationchange", measure);
        // 過去ログの開閉でもゲーム領域の高さが変わるため、要素自体を監視する
        const observer = new ResizeObserver(measure);
        if (gameAreaRef.current) {
            observer.observe(gameAreaRef.current);
        }
        return () => {
            clearTimeout(timer);
            observer.disconnect();
            window.removeEventListener("resize", measure);
            window.removeEventListener("orientationchange", measure);
        };
    }, [fullscreenOn]);

    const exitButtonLayout = useMemo(() => {
        const BUTTON_SIZE = 48;
        const MARGIN = 8;
        // inBar=false は黒帯が無くゲーム描画に重なるフォールバック。視認性のため強調表示する
        const fallback = {
            position: { top: MARGIN, right: MARGIN },
            tooltipPlacement: "bottom" as const,
            inBar: false,
        };
        if (!fullscreenViewport) {
            return fallback;
        }
        const { width: vw, height: vh } = fullscreenViewport;
        if (vw <= 0 || vh <= 0) {
            return fallback;
        }
        const ratio = contentWidth / contentHeight;
        const viewRatio = vw / vh;
        if (viewRatio > ratio) {
            // ピラーボックス: 左右に黒帯。右帯に配置する
            const barWidth = (vw - vh * ratio) / 2;
            if (barWidth >= BUTTON_SIZE + MARGIN) {
                return {
                    position: {
                        top: MARGIN,
                        right: Math.max(MARGIN, (barWidth - BUTTON_SIZE) / 2),
                    },
                    tooltipPlacement: "left" as const,
                    inBar: true,
                };
            }
        } else {
            // レターボックス: 上下に黒帯。上帯に配置する
            const barHeight = (vh - vw / ratio) / 2;
            if (barHeight >= BUTTON_SIZE + MARGIN) {
                return {
                    position: {
                        top: Math.max(MARGIN, (barHeight - BUTTON_SIZE) / 2),
                        right: MARGIN,
                    },
                    tooltipPlacement: "bottom" as const,
                    inBar: true,
                };
            }
        }
        return fallback;
    }, [fullscreenViewport, contentWidth, contentHeight]);

    // ゲーム起動直後、待機画面でスクロールした位置のままだとゲーム画面が画面外になるため、先頭へスクロールする
    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, []);

    useEffect(() => {
        if (!ref.current) {
            return;
        }

        function handleRequestPlayerInfo(
            request: ResolvingPlayerInfoRequest | undefined,
        ) {
            if (!request) {
                setRequestPlayerInfo(undefined);
                return;
            }
            setRequestPlayerInfo({
                ...request,
                onResolve: (accepted, name) => {
                    request.onResolve(accepted, name);
                    if (accepted && name) {
                        setPlayerName(name);
                    }
                },
            });
        }

        container.create({
            parent: ref.current,
            user,
            playerId,
            contentId: game.contentId,
            playId,
            playToken,
            playlogServerUrl,
            initialMasterVolume: isMuted
                ? 0
                : (volumePercent / 100) * MASTER_VOLUME_MAX,
            isGameMaster,
            external: contentExternal,
            onSkip: setSkipping,
            onError: setError,
            onOpenTroubleshoot: () => {
                setTroubleshootOpen(true);
            },
            onPlayEnd: (reason) => {
                if (onPlayEnd) {
                    onPlayEnd(reason);
                }
                setPlayEndReason(reason);
            },
            onPlayExtend: (payload) => {
                shownReminders.current.clear();
                setExtensionReminderType(undefined);
                setExpiresAt(payload.expiresAt);
                setRemainingMs(payload.remainingMs);
            },
            onRequestPlayerInfo: handleRequestPlayerInfo,
            playerBanBackend,
        });
        return () => {
            // Promiseだが、遅延終了しても影響なし
            container.destroy();
        };
    }, []);

    useEffect(() => {
        if (expiresAt == null) {
            return;
        }
        const intervalId = setInterval(() => {
            setRemainingMs(Math.max(expiresAt - Date.now(), 0));
        }, 1000);

        return () => {
            clearInterval(intervalId);
        };
    }, [expiresAt]);

    useEffect(() => {
        if (remainingMs == null) {
            return;
        }
        if (
            remainingMs <= extensionReminderThresholds.WARN &&
            !shownReminders.current.has("WARN")
        ) {
            shownReminders.current.add("WARN");
            setExtensionReminderType("WARN");
        } else if (
            remainingMs <= extensionReminderThresholds.INFO &&
            !shownReminders.current.has("INFO")
        ) {
            shownReminders.current.add("INFO");
            setExtensionReminderType("INFO");
        }
    }, [remainingMs]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        const currentUrl = new URL(`/play/${playId}`, window.location.origin);
        if (isLimited) {
            currentUrl.searchParams.set("inviteHash", inviteHash!);
        }
        setInviteUrl(currentUrl.toString());
    }, [playId, inviteHash, isLimited]);

    useEffect(() => {
        if (!handle || typeof window === "undefined") return;
        setLiveUrl(
            new URL(`/live/${handle}`, window.location.origin).toString(),
        );
    }, [handle]);

    async function handleExtend() {
        if (extendLoading) {
            return;
        }
        setExtendLoading(true);
        setExtendError(undefined);
        try {
            const json = await extendPlay({ playId });
            if (json.ok) {
                shownReminders.current.clear();
                setExtensionReminderType(undefined);
                setExpiresAt(json.expiresAt);
                setRemainingMs(json.remainingMs);
            } else if (json.reason === "TooEarly") {
                setExpiresAt(json.expiresAt);
                setRemainingMs(json.remainingMs);
                setExtendError("延長は残り10分以下から可能です。");
            } else if (json.reason === "Forbidden") {
                setExtendError(
                    "延長する権限がありません。画面を更新して入室し直してください。",
                );
            } else if (json.reason === "Drain") {
                setExtendError(
                    "現在臨時メンテナンス中のため、延長できません。残り時間をもって終了します。",
                );
            } else {
                setExtendError("延長に失敗しました。");
            }
        } catch (err) {
            console.warn("failed to extend", err);
            setExtendError("延長に失敗しました。");
        } finally {
            setExtendLoading(false);
        }
    }

    function handleCopyInvite() {
        if (inviteUrl) {
            copyInviteUrl(inviteUrl);
        }
    }

    function handleCopyLiveUrl() {
        if (liveUrl) {
            copyLiveUrl(liveUrl);
        }
    }

    function handleVolumeChange(_event: Event, value: number | number[]) {
        const nextPercent = Array.isArray(value) ? value[0] : value;
        setVolumePercent(nextPercent);
        setIsMuted(nextPercent === 0);
        if (nextPercent > 0) {
            setPrevVolumePercent(nextPercent);
        }
        const nextVolume = (nextPercent / 100) * MASTER_VOLUME_MAX;
        container.setMasterVolume(nextVolume);
    }

    function handleToggleMute() {
        if (isMuted || volumePercent === 0) {
            const restoredPercent =
                prevVolumePercent > 0 ? prevVolumePercent : 100;
            setVolumePercent(restoredPercent);
            setIsMuted(false);
            const nextVolume = (restoredPercent / 100) * MASTER_VOLUME_MAX;
            container.setMasterVolume(nextVolume);
            return;
        }
        setPrevVolumePercent(volumePercent);
        setVolumePercent(0);
        setIsMuted(true);
        container.setMasterVolume(0);
    }

    async function createScreenshotFile() {
        const canvas = container.getGameContentCanvas();
        if (!canvas) {
            return null;
        }
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, "image/png");
        });
        if (!blob) {
            return null;
        }
        const filename = `akashic-${playId}-${format(
            new Date(),
            "yyyyMMdd-HHmmss",
        )}.png`;
        const file = new File([blob], filename, { type: "image/png" });
        return {
            filename,
            blob,
            file,
        };
    }

    async function handleScreenshot() {
        const res = await createScreenshotFile();
        if (!res) {
            setScreenshotStatus("error");
            return;
        }
        const { file, blob, filename } = res;
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: `${game.title}のスクリーンショット`,
                });
                setScreenshotStatus("shared");
                return;
            } catch (err) {
                if ((err as { name?: string }).name === "AbortError") {
                    setScreenshotStatus("cancel");
                    return;
                }
                console.warn("failed to share screenshot", err);
            }
        }

        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.rel = "noopener";
            a.target = "_blank";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            setScreenshotStatus("downloaded");
        } catch (err) {
            console.warn("failed to download screenshot", err);
            setScreenshotStatus("error");
        }
    }

    async function handleShareToX() {
        if (isXSharing) {
            return;
        }
        if (typeof window === "undefined") {
            setXShareStatus("error");
            return;
        }
        setIsXSharing(true);
        setXShareStatus(undefined);
        // Safariはawait後のwindow.openをブロックするため、同期処理中にウィンドウを先に開く
        const newWindow = window.open("");
        // noopenerをwindow.openに渡すと戻り値がnullになるため、opener参照を手動で切る（リバースタブナビング対策）
        if (newWindow) {
            newWindow.opener = null;
        }
        try {
            const fileRes = await createScreenshotFile();
            if (!fileRes) {
                newWindow?.close();
                setXShareStatus("error");
                return;
            }
            const formData = new FormData();
            formData.append("playId", playId);
            formData.append("image", fileRes.file);
            const res = await uploadPlayShareScreenshot(formData);
            if (!res.ok) {
                newWindow?.close();
                setXShareStatus("error");
                return;
            }
            const shareUrl = new URL(`/play/${playId}`, window.location.origin);
            if (isLimited) {
                shareUrl.searchParams.set("inviteHash", inviteHash!);
            }
            shareUrl.searchParams.set("shareId", res.shareId);
            const params = new URLSearchParams([
                [
                    "text",
                    `ただいまゲームプレイ中！一緒に遊ぼう！\n${playName ?? ""}`,
                ],
                ["url", shareUrl.toString()],
                ["hashtags", ["みんなでゲーム", game.title].join(",")],
            ]);
            const intentUrl = `https://x.com/intent/tweet?${params.toString()}`;
            if (newWindow) {
                newWindow.location.href = intentUrl;
            } else {
                window.open(intentUrl, "_blank", "noopener,noreferrer");
            }
            setXShareStatus("shared");
        } catch (err) {
            console.warn("failed to open X intent", err);
            newWindow?.close();
            setXShareStatus("error");
        } finally {
            setIsXSharing(false);
        }
    }

    const gameViewSizingSx = fullscreenOn
        ? {
              width: "100%",
              height: "100%",
              maxWidth: "none",
              px: 0,
          }
        : {
              aspectRatio: contentWidth / contentHeight,
              contain: "size",
              "@media (orientation: landscape) and (max-height: 600px)": {
                  width: `min(100%, calc(100svh * ${contentWidth / contentHeight}))`,
              },
          };

    return (
        <>
            {error && (
                <Container maxWidth="md" sx={{ mt: 2 }}>
                    <Alert variant="filled" severity="error">
                        {error}
                    </Alert>
                </Container>
            )}
            <PlayChatProvider
                playId={playId}
                isGameMaster={isGameMaster}
                enabled={chatEnabled}
                fullscreen={fullscreenOn}
                playerName={playerName}
                setPlayerName={setPlayerName}
            >
                <Box
                    ref={fullscreenRef}
                    sx={{
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                        ...(fullscreenOn && {
                            position: "fixed",
                            inset: 0,
                            zIndex: theme.zIndex.appBar + 1,
                            backgroundColor: "#000",
                        }),
                    }}
                >
                    {chatEnabled && <PlayChatTicker />}
                    <Box
                        ref={gameAreaRef}
                        sx={{
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            // 全画面では帯の分だけゲームを縮める
                            ...(fullscreenOn && {
                                flex: "1 1 auto",
                                minHeight: 0,
                            }),
                        }}
                    >
                        <Container
                            component="div"
                            disableGutters
                            sx={{ ...gameViewSizingSx, position: "relative" }}
                        >
                            <Box
                                ref={ref}
                                sx={{
                                    width: "100%",
                                    height: "100%",
                                    isolation: "isolate",
                                    userSelect: "none",
                                    WebkitUserSelect: "none",
                                    WebkitTapHighlightColor: "transparent",
                                    touchAction: "none",
                                }}
                            />
                            {skipping && (
                                <Box
                                    aria-hidden
                                    onPointerDown={() =>
                                        setWarning("EVENT_ON_SKIPPING")
                                    }
                                    sx={{
                                        position: "absolute",
                                        inset: 0,
                                        cursor: "wait",
                                        touchAction: "none",
                                    }}
                                />
                            )}
                        </Container>
                        {fullscreenOn && (
                            <>
                                {!exitButtonLayout.inBar && (
                                    <Box
                                        aria-hidden
                                        sx={{
                                            position: "absolute",
                                            top: 0,
                                            right: 0,
                                            width: 50,
                                            height: 50,
                                            zIndex: 1,
                                            pointerEvents: "none",
                                            background:
                                                "radial-gradient(circle at top right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0) 72%)",
                                        }}
                                    />
                                )}
                                <Tooltip
                                    arrow
                                    open={fullscreenGuideOpen}
                                    onOpen={() => setFullscreenGuideOpen(true)}
                                    onClose={() =>
                                        setFullscreenGuideOpen(false)
                                    }
                                    placement={
                                        exitButtonLayout.tooltipPlacement
                                    }
                                    title="ここをタップすると全画面を終了します"
                                    // ネイティブ全画面では全画面要素の外(body)に描画すると見えないため、
                                    // ポータルを無効化して全画面要素内に描画する
                                    slotProps={{
                                        popper: {
                                            disablePortal: true,
                                        },
                                    }}
                                >
                                    <IconButton
                                        aria-label="全画面を終了"
                                        onClick={handleToggleFullscreen}
                                        sx={{
                                            position: "absolute",
                                            ...exitButtonLayout.position,
                                            zIndex: 2,
                                            color: "#fff",
                                            transition:
                                                "opacity 0.2s, background-color 0.2s",
                                            ...(exitButtonLayout.inBar
                                                ? {
                                                      opacity: 0.6,
                                                      backgroundColor: alpha(
                                                          "#000",
                                                          0.35,
                                                      ),
                                                  }
                                                : {
                                                      opacity: 0.92,
                                                      backgroundColor: alpha(
                                                          "#000",
                                                          0.6,
                                                      ),
                                                      boxShadow:
                                                          "0 0 8px rgba(0,0,0,0.7)",
                                                  }),
                                            "&:hover": {
                                                opacity: 1,
                                                backgroundColor: alpha(
                                                    "#000",
                                                    0.7,
                                                ),
                                            },
                                            "&:active": {
                                                backgroundColor: alpha(
                                                    "#fff",
                                                    0.3,
                                                ),
                                            },
                                        }}
                                    >
                                        <FullscreenExit fontSize="large" />
                                    </IconButton>
                                </Tooltip>
                            </>
                        )}
                    </Box>
                    {chatEnabled && <PlayChatInput />}
                </Box>
            </PlayChatProvider>
            <ClientLogDialog
                open={troubleshootOpen}
                contentId={game.contentId}
                playId={playId}
                getLogs={() => container.getClientLogs()}
                isTruncated={container.isClientLogTruncated()}
                lastSubmittedComment={lastSubmittedComment}
                onClose={() => setTroubleshootOpen(false)}
                onSubmitSuccess={(comment) => {
                    container.clearClientLogs();
                    setLastSubmittedComment((prev) => {
                        if (!comment) {
                            return prev;
                        }
                        if (!prev) {
                            return comment;
                        }
                        return `${prev}\n---\n${comment}`;
                    });
                }}
            />
            {requestPlayerInfo && (
                <PlayPlayerInfoResolver
                    request={requestPlayerInfo}
                    requireSignIn={requireSignIn}
                />
            )}
            <PlayBanConfirmDialog
                open={banConfirmPending > 0}
                allRooms={user.authType === "oauth"}
                queued={banConfirmPending - 1}
                onConfirm={() => resolveBanConfirm(true)}
                onCancel={() => resolveBanConfirm(false)}
            />
            {banNotice && (
                <Snackbar
                    open={!!banNotice}
                    anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                    autoHideDuration={4000}
                    onClose={() => setBanNotice(undefined)}
                >
                    <Alert
                        variant="filled"
                        severity="info"
                        onClose={() => setBanNotice(undefined)}
                        sx={{ color: "inherit" }}
                    >
                        {banNotice}
                    </Alert>
                </Snackbar>
            )}
            {banError && (
                <Snackbar
                    open={!!banError}
                    anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                    autoHideDuration={5000}
                    onClose={() => setBanError(undefined)}
                >
                    <Alert
                        variant="filled"
                        severity="error"
                        onClose={() => setBanError(undefined)}
                    >
                        {banError}
                    </Alert>
                </Snackbar>
            )}
            {playEndReason && <PlayEndNotification reason={playEndReason} />}
            <PlayLeaveDialog
                open={leaveGuard.leaveDialogOpen}
                isClosing={leaveGuard.isClosing}
                closeError={leaveGuard.closeError}
                onCloseRoomAndLeave={leaveGuard.closeRoomAndLeave}
                onLeaveWithoutClosing={leaveGuard.leaveWithoutClosing}
                onCancel={leaveGuard.cancelLeave}
            />
            {warning && (
                <Snackbar
                    open={!!warning}
                    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                    autoHideDuration={3000}
                    disableWindowBlurListener={true}
                    slotProps={{
                        clickAwayListener: {
                            onClickAway: (event) => {
                                (event as any).defaultMuiPrevented = true;
                            },
                        },
                    }}
                    onClose={handleClose}
                >
                    <Alert variant="outlined" severity="warning">
                        {toMessage(warning)}
                    </Alert>
                </Snackbar>
            )}
            <CopyStatusSnackbar
                status={inviteCopyStatus}
                onClose={clearInviteCopyStatus}
                successMessage="招待リンクをコピーしました。"
            />
            {screenshotStatus && (
                <Snackbar
                    open={!!screenshotStatus}
                    anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                    autoHideDuration={2500}
                    onClose={() => setScreenshotStatus(undefined)}
                >
                    <Alert
                        variant="outlined"
                        severity={
                            screenshotStatus === "error"
                                ? "error"
                                : screenshotStatus === "cancel"
                                  ? "warning"
                                  : "success"
                        }
                    >
                        {screenshotStatus === "shared"
                            ? "スクリーンショットを共有しました。"
                            : screenshotStatus === "downloaded"
                              ? "スクリーンショットを保存しました。"
                              : screenshotStatus === "cancel"
                                ? "共有をキャンセルしました。"
                                : "スクリーンショットの保存に失敗しました。"}
                    </Alert>
                </Snackbar>
            )}
            {xShareStatus && (
                <Snackbar
                    open={!!xShareStatus}
                    anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                    autoHideDuration={3000}
                    onClose={() => setXShareStatus(undefined)}
                >
                    <Alert
                        variant="outlined"
                        severity={
                            xShareStatus === "error" ? "error" : "success"
                        }
                    >
                        {xShareStatus === "shared"
                            ? "Xに投稿しました。"
                            : "Xへの投稿に失敗しました。"}
                    </Alert>
                </Snackbar>
            )}
            <CopyStatusSnackbar
                status={liveCopyStatus}
                onClose={clearLiveCopyStatus}
                successMessage={
                    (isGameMaster ? "あなたの" : `${gameMaster.name} さんの`) +
                    "部屋リンクをコピーしました。"
                }
            />
            {extensionReminderType && (
                <Snackbar
                    open={!!extensionReminderType}
                    anchorOrigin={{ vertical: "top", horizontal: "center" }}
                    autoHideDuration={
                        extensionReminderType === "INFO" ? 15000 : null
                    }
                    onClose={(_, reason) => {
                        if (reason === "timeout") {
                            setExtensionReminderType(undefined);
                        }
                    }}
                    disableWindowBlurListener={true}
                    slotProps={{
                        clickAwayListener: {
                            onClickAway: (event) => {
                                (event as any).defaultMuiPrevented = true;
                            },
                        },
                    }}
                >
                    <Alert
                        severity={
                            extensionReminderType === "INFO"
                                ? "info"
                                : "warning"
                        }
                        variant="filled"
                        onClick={() => setExtensionReminderType(undefined)}
                        sx={{
                            cursor: "pointer",
                            alignItems: "center",
                            backgroundColor: alpha(
                                extensionReminderType === "INFO"
                                    ? theme.palette.info.main
                                    : theme.palette.warning.main,
                                0.7,
                            ),
                            color: theme.palette.text.primary,
                            py: 2,
                        }}
                        action={
                            <Button
                                variant="contained"
                                onClick={() => handleExtend()}
                                disabled={extendLoading}
                                sx={{
                                    filter: "drop-shadow(5px 5px 5px rgba(0, 0, 0, 0.3))",
                                }}
                            >
                                30分延長する
                            </Button>
                        }
                    >
                        {extensionReminderType === "INFO"
                            ? "残り5分で終了します"
                            : "残り2分で終了します!!"}
                    </Alert>
                </Snackbar>
            )}
            <Container maxWidth="md" sx={{ mt: 2 }}>
                <Stack spacing={2}>
                    <Card>
                        <CardContent>
                            <Stack spacing={1} divider={<Divider />}>
                                <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={1}
                                    sx={{
                                        alignItems: {
                                            xs: "flex-start",
                                            sm: "center",
                                        },
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <Stack spacing={1}>
                                        <Typography variant="h6">
                                            {playName}
                                        </Typography>
                                        {(isLimited ||
                                            requireSignIn ||
                                            !chatEnabled) && (
                                            <Stack
                                                direction="row"
                                                sx={{
                                                    alignItems: "center",
                                                    flexWrap: "wrap",
                                                    // spacing は margin-left で実装されるため、
                                                    // 折り返した 2 行目の先頭がインデントされてしまう
                                                    columnGap: 2,
                                                    rowGap: 0.5,
                                                }}
                                            >
                                                {isLimited && (
                                                    <Tooltip
                                                        arrow
                                                        title="この部屋は招待リンクまたは入室の言葉を知っている人だけが参加できます。"
                                                    >
                                                        <Stack
                                                            direction="row"
                                                            spacing={1}
                                                            sx={{
                                                                alignItems:
                                                                    "center",
                                                            }}
                                                        >
                                                            <Lock
                                                                fontSize="small"
                                                                sx={{
                                                                    color: theme
                                                                        .palette
                                                                        .text
                                                                        .secondary,
                                                                }}
                                                            />
                                                            <Typography
                                                                variant="body2"
                                                                color="textSecondary"
                                                            >
                                                                限定
                                                            </Typography>
                                                        </Stack>
                                                    </Tooltip>
                                                )}
                                                {requireSignIn && (
                                                    <Tooltip
                                                        arrow
                                                        title="この部屋はサインインしたユーザーのみ参加できます。"
                                                    >
                                                        <Stack
                                                            direction="row"
                                                            spacing={1}
                                                            sx={{
                                                                alignItems:
                                                                    "center",
                                                            }}
                                                        >
                                                            <NoAccounts
                                                                fontSize="small"
                                                                sx={{
                                                                    color: theme
                                                                        .palette
                                                                        .text
                                                                        .secondary,
                                                                }}
                                                            />
                                                            <Typography
                                                                variant="body2"
                                                                color="textSecondary"
                                                            >
                                                                ゲスト禁止
                                                            </Typography>
                                                        </Stack>
                                                    </Tooltip>
                                                )}
                                                {!chatEnabled && (
                                                    <Tooltip
                                                        arrow
                                                        title="この部屋では部屋チャットが無効です。"
                                                    >
                                                        <Stack
                                                            direction="row"
                                                            spacing={1}
                                                            sx={{
                                                                alignItems:
                                                                    "center",
                                                            }}
                                                        >
                                                            <SpeakerNotesOff
                                                                fontSize="small"
                                                                sx={{
                                                                    color: theme
                                                                        .palette
                                                                        .text
                                                                        .secondary,
                                                                }}
                                                            />
                                                            <Typography
                                                                variant="body2"
                                                                color="textSecondary"
                                                            >
                                                                チャットOFF
                                                            </Typography>
                                                        </Stack>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        )}
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            sx={{
                                                alignItems: "center",
                                            }}
                                        >
                                            <Typography
                                                variant="body2"
                                                color="textSecondary"
                                            >
                                                部屋主
                                            </Typography>
                                            <UserInline
                                                user={{
                                                    id: gameMaster.userId,
                                                    name: gameMaster.name,
                                                    image: gameMaster.iconURL,
                                                }}
                                                textVariant="body2"
                                                avatarSize={32}
                                                openInNewWindow
                                            />
                                            {!isGameMaster && (
                                                <>
                                                    <Box sx={{ flexGrow: 1 }} />
                                                    <ReportMenu
                                                        ariaLabel="部屋の操作"
                                                        target={{
                                                            kind: "play",
                                                            playId: Number(
                                                                playId,
                                                            ),
                                                        }}
                                                        dialogTitle="部屋を通報"
                                                        dialogDescription="この部屋を運営に通報します。部屋主には通知されません。"
                                                    />
                                                </>
                                            )}
                                        </Stack>
                                        <Stack direction="row">
                                            <Typography
                                                variant="body2"
                                                color="textSecondary"
                                            >
                                                作成
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                color="textSecondary"
                                            >
                                                {formatCreatedAt()}
                                            </Typography>
                                        </Stack>
                                    </Stack>
                                    <Stack
                                        spacing={1}
                                        sx={{
                                            alignItems: {
                                                xs: "flex-start",
                                                sm: "center",
                                            },
                                        }}
                                    >
                                        <Stack
                                            direction="row"
                                            sx={{
                                                alignItems: "center",
                                                width: "100%",
                                                flexWrap: "wrap",
                                                rowGap: 1,
                                            }}
                                        >
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                sx={{
                                                    alignItems: "center",
                                                    mr: 1,
                                                }}
                                            >
                                                <IconButton
                                                    onClick={handleToggleMute}
                                                    aria-label={
                                                        isMuted ||
                                                        volumePercent === 0
                                                            ? "ミュート解除"
                                                            : "ミュート"
                                                    }
                                                >
                                                    {isMuted ||
                                                    volumePercent === 0 ? (
                                                        <VolumeOff fontSize="large" />
                                                    ) : (
                                                        <VolumeUp fontSize="large" />
                                                    )}
                                                </IconButton>
                                                <Slider
                                                    value={volumePercent}
                                                    onChange={
                                                        handleVolumeChange
                                                    }
                                                    aria-label="音量"
                                                    sx={{
                                                        minWidth: "100px",
                                                    }}
                                                />
                                            </Stack>
                                            <IconButton
                                                aria-label="スクリーンショット"
                                                onClick={handleScreenshot}
                                            >
                                                <PhotoCamera fontSize="large" />
                                            </IconButton>
                                            <IconButton
                                                aria-label="Xに投稿"
                                                onClick={handleShareToX}
                                                disabled={isXSharing}
                                            >
                                                <X fontSize="large" />
                                            </IconButton>
                                            <Tooltip
                                                arrow
                                                title={
                                                    fullscreenOn
                                                        ? "全画面を終了"
                                                        : "全画面で表示"
                                                }
                                            >
                                                <IconButton
                                                    aria-label={
                                                        fullscreenOn
                                                            ? "全画面を終了"
                                                            : "全画面で表示"
                                                    }
                                                    onClick={
                                                        handleToggleFullscreen
                                                    }
                                                >
                                                    {fullscreenOn ? (
                                                        <FullscreenExit fontSize="large" />
                                                    ) : (
                                                        <Fullscreen fontSize="large" />
                                                    )}
                                                </IconButton>
                                            </Tooltip>
                                            <TroubleshootButton
                                                onClick={() => {
                                                    setTroubleshootOpen(true);
                                                }}
                                            />
                                        </Stack>
                                        {extendError && (
                                            <Alert
                                                severity="warning"
                                                variant="outlined"
                                            >
                                                {extendError}
                                            </Alert>
                                        )}
                                        <Stack
                                            direction="row"
                                            sx={{
                                                gap: 1,
                                                alignItems: "center",
                                            }}
                                        >
                                            <Stack direction="row" spacing={2}>
                                                <Typography
                                                    variant="body1"
                                                    color="textSecondary"
                                                >
                                                    終了まで
                                                </Typography>
                                                <Typography variant="body1">
                                                    {formatRemaining(
                                                        remainingMs,
                                                    )}
                                                </Typography>
                                            </Stack>
                                            <Button
                                                variant="contained"
                                                onClick={handleExtend}
                                                disabled={
                                                    remainingMs == null ||
                                                    remainingMs >
                                                        EXTEND_WINDOW_MS ||
                                                    extendLoading
                                                }
                                            >
                                                30分延長する
                                            </Button>
                                        </Stack>
                                    </Stack>
                                </Stack>
                                {pageType === "live" && (
                                    <Stack spacing={1}>
                                        <Typography variant="body1">
                                            {isGameMaster
                                                ? "あなたの部屋リンク"
                                                : `${gameMaster.name} さんの部屋リンク`}
                                        </Typography>
                                        <CopyLinkBox
                                            url={liveUrl}
                                            onCopy={handleCopyLiveUrl}
                                            mode="light"
                                        />
                                        <Typography
                                            variant="body2"
                                            color="textSecondary"
                                        >
                                            {isGameMaster
                                                ? "このリンクを共有すると、いつでもあなたが作成した最新の部屋に案内できます。"
                                                : `このリンクを共有すると、いつでも ${gameMaster.name} さんの最新の部屋に案内できます。`}
                                        </Typography>
                                        {isLimited && (
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                sx={{ alignItems: "center" }}
                                            >
                                                <Typography
                                                    variant="body2"
                                                    color="textSecondary"
                                                >
                                                    入室の言葉
                                                </Typography>
                                                <Tooltip
                                                    arrow
                                                    title="この部屋は限定公開です。リンクを開いた人が入室するには、この言葉が必要です。共有先に伝えてください。"
                                                >
                                                    <HelpOutlined
                                                        fontSize="small"
                                                        sx={{
                                                            color: theme.palette
                                                                .text.secondary,
                                                        }}
                                                    />
                                                </Tooltip>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        borderRadius: 1,
                                                        bgcolor:
                                                            theme.palette
                                                                .background
                                                                .default,
                                                        textDecoration: "none",
                                                        fontFamily: "monospace",
                                                        p: 1,
                                                    }}
                                                >
                                                    {joinWord}
                                                </Typography>
                                            </Stack>
                                        )}
                                    </Stack>
                                )}
                                {pageType === "play" && (
                                    <Stack spacing={1}>
                                        <Typography variant="body1">
                                            招待リンク
                                        </Typography>
                                        <CopyLinkBox
                                            url={inviteUrl}
                                            onCopy={handleCopyInvite}
                                            mode="light"
                                        />
                                        <Typography
                                            variant="body2"
                                            color="textSecondary"
                                        >
                                            {isLimited
                                                ? "このリンクを知っている人は誰でも無条件で入室できます。共有先にご注意ください。"
                                                : "この部屋に招待したい人に上のリンクを共有してください。"}
                                        </Typography>
                                        {isLimited && (
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                sx={{
                                                    alignItems: "center",
                                                }}
                                            >
                                                <Typography
                                                    variant="body2"
                                                    color="textSecondary"
                                                >
                                                    入室の言葉
                                                </Typography>
                                                <Tooltip
                                                    arrow
                                                    title="トップページから入室する場合に求められる合言葉です。入室できない人がいた場合、この言葉を伝えて下さい。"
                                                >
                                                    <HelpOutlined
                                                        fontSize="small"
                                                        sx={{
                                                            color: theme.palette
                                                                .text.secondary,
                                                        }}
                                                    />
                                                </Tooltip>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        borderRadius: 1,
                                                        bgcolor:
                                                            theme.palette
                                                                .background
                                                                .default,
                                                        textDecoration: "none",
                                                        fontFamily: "monospace",
                                                        p: 1,
                                                    }}
                                                >
                                                    {joinWord}
                                                </Typography>
                                            </Stack>
                                        )}
                                    </Stack>
                                )}
                                {pageType === "play" &&
                                    isGameMaster &&
                                    user.authType === "oauth" && (
                                        <Stack spacing={1}>
                                            <Typography variant="body1">
                                                あなたの部屋リンク
                                            </Typography>
                                            {handle ? (
                                                <>
                                                    <CopyLinkBox
                                                        url={liveUrl}
                                                        onCopy={
                                                            handleCopyLiveUrl
                                                        }
                                                        mode="light"
                                                    />
                                                    <Typography
                                                        variant="body2"
                                                        color="textSecondary"
                                                    >
                                                        このリンクを共有すると、いつでもあなたが作成した最新の部屋に案内することができます。
                                                    </Typography>
                                                </>
                                            ) : (
                                                <Alert
                                                    severity="info"
                                                    variant="outlined"
                                                    action={
                                                        <Button
                                                            variant="outlined"
                                                            onClick={() =>
                                                                setHandleDialogOpen(
                                                                    true,
                                                                )
                                                            }
                                                            sx={{
                                                                borderColor:
                                                                    theme
                                                                        .palette
                                                                        .primary
                                                                        .light,
                                                                color: theme
                                                                    .palette
                                                                    .primary
                                                                    .light,
                                                                py: 1,
                                                            }}
                                                        >
                                                            設定する
                                                        </Button>
                                                    }
                                                    sx={{
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    あなたの部屋IDを設定すると、いつでもあなたが作成した最新の部屋に案内できます。
                                                </Alert>
                                            )}
                                        </Stack>
                                    )}
                                {isGameMaster && (
                                    <Stack sx={{ justifyContent: "center" }}>
                                        <PlayCloseDialog
                                            playId={playId}
                                            afterClose={afterPlayClose}
                                            recreate={{
                                                game,
                                                user,
                                                initialValues: {
                                                    playName,
                                                    isLimited,
                                                    joinWord,
                                                    requireSignIn,
                                                    chatEnabled,
                                                },
                                                afterCreate: afterRecreate,
                                            }}
                                        />
                                    </Stack>
                                )}
                                <HandleSetDialog
                                    open={handleDialogOpen}
                                    onClose={() => setHandleDialogOpen(false)}
                                    onHandleSet={(newHandle) => {
                                        setHandle(newHandle);
                                        setHandleDialogOpen(false);
                                    }}
                                />
                            </Stack>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={2}
                                >
                                    <Avatar
                                        variant="square"
                                        src={game.iconURL}
                                        sx={{
                                            width: 120,
                                            height: 120,
                                        }}
                                    />
                                    <Stack spacing={1} sx={{ flex: 1 }}>
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            sx={{
                                                alignItems: "center",
                                            }}
                                        >
                                            <Typography
                                                variant="h5"
                                                component="h1"
                                            >
                                                {game.title}
                                            </Typography>
                                            <Tooltip
                                                arrow
                                                title={
                                                    game.streaming ? (
                                                        <Stack spacing={1}>
                                                            <Typography variant="body2">
                                                                このゲームはプレイ中の画面を配信したり、動画投稿することが許可されています。
                                                            </Typography>
                                                            {niconicommonsWorkUrl && (
                                                                <Typography variant="body2">
                                                                    ニコニコ動画・生放送では
                                                                    <Link
                                                                        href={
                                                                            niconicommonsWorkUrl
                                                                        }
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            color: "inherit",
                                                                            textDecoration:
                                                                                "underline",
                                                                            marginLeft: 4,
                                                                            marginRight: 4,
                                                                        }}
                                                                    >
                                                                        親作品登録
                                                                    </Link>
                                                                    を推奨しています（任意）。登録いただくとサーバー稼働維持に役立ちます。
                                                                </Typography>
                                                            )}
                                                        </Stack>
                                                    ) : (
                                                        <Typography variant="body2">
                                                            このゲームはプレイ中の画面を配信したり、動画投稿することを禁止しています。
                                                        </Typography>
                                                    )
                                                }
                                            >
                                                <Stack
                                                    direction="row"
                                                    spacing={0.5}
                                                    sx={{
                                                        alignItems: "center",
                                                        color: game.streaming
                                                            ? theme.palette
                                                                  .success.light
                                                            : theme.palette
                                                                  .error.light,
                                                        cursor: "help",
                                                    }}
                                                >
                                                    {game.streaming ? (
                                                        <Videocam
                                                            fontSize="small"
                                                            aria-label="配信OK"
                                                        />
                                                    ) : (
                                                        <VideocamOff
                                                            fontSize="small"
                                                            aria-label="配信不可"
                                                        />
                                                    )}
                                                    <Typography variant="body2">
                                                        {game.streaming
                                                            ? "配信OK"
                                                            : "配信不可"}
                                                    </Typography>
                                                </Stack>
                                            </Tooltip>
                                            <FavoriteButton
                                                gameId={game.id}
                                                initialFavorited={
                                                    game.isFavorited
                                                }
                                            />
                                        </Stack>
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            sx={{
                                                alignItems: "center",
                                            }}
                                        >
                                            <Typography
                                                variant="body2"
                                                color="textSecondary"
                                            >
                                                制作者
                                            </Typography>
                                            <UserInline
                                                user={{
                                                    id: game.publisher.id,
                                                    name: game.publisher.name,
                                                    image: game.publisher.image,
                                                }}
                                                textVariant="body2"
                                                avatarSize={20}
                                                openInNewWindow
                                            />
                                        </Stack>
                                        <Typography
                                            variant="body1"
                                            sx={{ whiteSpace: "pre-wrap" }}
                                        >
                                            {renderTextWithLinks(
                                                game.description,
                                            )}
                                        </Typography>
                                        <CreditPanel
                                            credit={game.credit}
                                            contentId={game.contentId}
                                        />
                                    </Stack>
                                </Stack>
                                <Stack
                                    direction="row"
                                    sx={{
                                        justifyContent: "flex-end",
                                    }}
                                >
                                    <Button
                                        component={Link}
                                        href={`/game/${game.id}#feedback`}
                                        target="_blank"
                                        variant="outlined"
                                        endIcon={<OpenInNew />}
                                        sx={{
                                            borderColor:
                                                theme.palette.primary.light,
                                            color: theme.palette.primary.light,
                                        }}
                                    >
                                        このゲームの投稿者にフィードバックを送る
                                    </Button>
                                </Stack>
                            </Stack>
                        </CardContent>
                    </Card>
                </Stack>
            </Container>
        </>
    );
}
