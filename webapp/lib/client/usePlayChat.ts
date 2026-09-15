import { useCallback, useEffect, useRef, useState } from "react";
import { PlayChatGetResponse, PlayChatMessageInfo } from "../types";

const POLL_INTERVAL_MS = 3000;

/**
 * 部屋チャットを差分取得する。SWR ではなく手書きなのは、取得済みメッセージへの
 * 追記と「未表示の新着」の受け渡しをカーソルで制御する必要があるため。
 */
export function usePlayChat(playId: string, enabled: boolean) {
    const [messages, setMessages] = useState<PlayChatMessageInfo[]>([]);
    const [isLoading, setIsLoading] = useState(enabled);
    const [error, setError] = useState<string>();
    const cursorRef = useRef<number | undefined>(undefined);
    const inFlightRef = useRef(false);
    // 初回取得分は既に流れ終わったものとして扱い、ティッカーには流さない
    const primedRef = useRef(false);
    const [isPrimed, setIsPrimed] = useState(false);
    const [incoming, setIncoming] = useState<PlayChatMessageInfo[]>([]);

    const fetchMessages = useCallback(async () => {
        // 投稿直後の再取得と定期ポーリングが重なると、同じカーソルで二重に
        // 取得してコメントが重複するため、多重実行を抑止する
        if (inFlightRef.current) {
            return;
        }
        inFlightRef.current = true;
        const query =
            cursorRef.current == null ? "" : `?after=${cursorRef.current}`;
        try {
            // trailingSlash: true のため、末尾スラッシュを付けてリダイレクトを避ける
            const res = (await (
                await fetch(`/api/play/${playId}/chat/${query}`)
            ).json()) as PlayChatGetResponse;
            if (!res.ok) {
                if (res.reason === "Forbidden") {
                    setError(
                        "チャットの閲覧権限がありません。画面を更新してください。",
                    );
                } else if (res.reason === "InternalError") {
                    setError(
                        "チャットの取得に失敗しました。時間をおいてリトライしてください。",
                    );
                }
                return;
            }
            setError(undefined);
            if (res.data.length > 0) {
                cursorRef.current = res.data[res.data.length - 1].id;
                setMessages((prev) => [...prev, ...res.data]);
                if (primedRef.current) {
                    setIncoming((prev) => [...prev, ...res.data]);
                }
            }
            primedRef.current = true;
            setIsPrimed(true);
        } catch (err) {
            console.warn("failed to fetch play chat", err);
        } finally {
            inFlightRef.current = false;
            setIsLoading(false);
        }
    }, [playId]);

    useEffect(() => {
        if (!enabled) {
            return;
        }
        void fetchMessages();
        const intervalId = setInterval(() => {
            void fetchMessages();
        }, POLL_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [enabled, fetchMessages]);

    const consumeIncoming = useCallback((upTo: number) => {
        setIncoming((prev) => prev.filter((message) => message.id > upTo));
    }, []);

    return {
        messages,
        incoming,
        consumeIncoming,
        isLoading,
        isPrimed,
        error,
        refresh: fetchMessages,
    };
}
