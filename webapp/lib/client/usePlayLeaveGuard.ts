"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { PlayParticipantsResponse } from "@/lib/types";
import { endPlayAction } from "@/lib/server/play-end-action";

const fetcher = async (url: string): Promise<number> => {
    const res = (await (await fetch(url)).json()) as PlayParticipantsResponse;
    if (!res.ok) {
        // 取得失敗時は安全側(=自分しかいない判定にしない)に倒すため大きめの値を返す。
        return Number.POSITIVE_INFINITY;
    }
    return res.participants;
};

// 部屋主が「自分しかいない部屋」を閉じずにアプリ内遷移しようとしたとき、
// 遷移を横取りして「部屋を閉じますか？」の確認を挟むためのフック。
//
// App Router には遷移ブロックの公式 API が無いため、capture フェーズの
// クリックリスナで a[href] へのアプリ内遷移を検出して横取りする。
// 戻る/進む(popstate)もガードする。タブ閉じ・リロード・URL 直打ち等は
// 横取りできないため、それらはサーバー側の無人自動クローズで回収する。
export function usePlayLeaveGuard({
    playId,
    enabled,
}: {
    playId: string;
    enabled: boolean;
}) {
    const router = useRouter();
    // 参加者数(アクティブインスタンスを除いたブラウザ接続数)を軽くポーリング。
    const { data: participants } = useSWR(
        enabled ? `/api/play/${playId}/participants` : null,
        fetcher,
        { refreshInterval: 20000 },
    );
    const participantsRef = useRef<number>(undefined);
    participantsRef.current = participants;

    // 横取り対象の遷移先。null のときダイアログは閉じている。
    const [pendingHref, setPendingHref] = useState<string>();
    const [isClosing, setIsClosing] = useState(false);
    const [closeError, setCloseError] = useState<string>();
    // popstate を意図的に通過させるためのフラグ。
    const bypassPopRef = useRef(false);

    // 「自分しかいない」= 参加者が 0 または 1(自分のみ)。未取得時は横取りしない。
    const isAlone = useCallback(() => {
        const count = participantsRef.current;
        return count != null && count <= 1;
    }, []);

    // ガード中に部屋が終了した場合など、無効化されたら開いているダイアログも引っ込める。
    useEffect(() => {
        if (!enabled) {
            setPendingHref(undefined);
            setCloseError(undefined);
        }
    }, [enabled]);

    useEffect(() => {
        if (!enabled || typeof window === "undefined") {
            return;
        }

        const onClickCapture = (ev: MouseEvent) => {
            // 左クリック以外・修飾キー付き(別タブで開く等)は対象外。
            if (
                ev.defaultPrevented ||
                ev.button !== 0 ||
                ev.metaKey ||
                ev.ctrlKey ||
                ev.shiftKey ||
                ev.altKey
            ) {
                return;
            }
            const anchor = (ev.target as HTMLElement | null)?.closest("a");
            if (!anchor) {
                return;
            }
            const href = anchor.getAttribute("href");
            if (
                !href ||
                anchor.target === "_blank" ||
                anchor.hasAttribute("download")
            ) {
                return;
            }
            const url = new URL(href, window.location.href);
            // 別オリジンへの遷移は横取りしない(外部リンク)。
            if (url.origin !== window.location.origin) {
                return;
            }
            // 同一ページ内のハッシュ/クエリ移動はページ離脱ではないので対象外。
            if (url.pathname === window.location.pathname && url.hash !== "") {
                return;
            }
            if (!isAlone()) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            setPendingHref(url.pathname + url.search + url.hash);
        };

        // 戻る/進むを一旦引き止めるためのセンチネルを積む。
        window.history.pushState(null, "", window.location.href);
        const onPopState = () => {
            if (bypassPopRef.current) {
                bypassPopRef.current = false;
                return;
            }
            if (isAlone()) {
                // 戻るを取り消してダイアログを表示する。
                window.history.pushState(null, "", window.location.href);
                // 戻るで離脱しようとした場合の遷移先はトップとする。
                setPendingHref("/");
            }
        };

        document.addEventListener("click", onClickCapture, true);
        window.addEventListener("popstate", onPopState);
        return () => {
            document.removeEventListener("click", onClickCapture, true);
            window.removeEventListener("popstate", onPopState);
        };
    }, [enabled, isAlone]);

    const navigate = useCallback(
        (href: string) => {
            bypassPopRef.current = true;
            router.push(href);
        },
        [router],
    );

    const cancelLeave = useCallback(() => {
        setPendingHref(undefined);
        setCloseError(undefined);
    }, []);

    const leaveWithoutClosing = useCallback(() => {
        if (!pendingHref) {
            return;
        }
        const href = pendingHref;
        setPendingHref(undefined);
        navigate(href);
    }, [pendingHref, navigate]);

    const closeRoomAndLeave = useCallback(async () => {
        if (!pendingHref || isClosing) {
            return;
        }
        setIsClosing(true);
        setCloseError(undefined);
        const res = await endPlayAction({ playId });
        setIsClosing(false);
        if (res.ok) {
            const href = pendingHref;
            setPendingHref(undefined);
            navigate(href);
        } else {
            setCloseError(
                "部屋を閉じる処理に失敗しました。時間をおいてリトライしてください。",
            );
        }
    }, [pendingHref, isClosing, playId, navigate]);

    return {
        leaveDialogOpen: pendingHref != null,
        isClosing,
        closeError,
        cancelLeave,
        leaveWithoutClosing,
        closeRoomAndLeave,
    };
}
