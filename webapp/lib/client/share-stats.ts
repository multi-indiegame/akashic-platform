/**
 * 記録のページを共有する。
 *
 * WHY: 端末の共有機能が使えるならそちらを優先し、使えなければ URL をコピーする。
 */

/** 共有の結果。画面の出し分けに使う */
export interface ShareResult {
    severity: "success" | "error";
    message: string;
}

interface ShareTarget {
    path: string;
    text: string;
    hashtags: string[];
}

/** ゲームの統計ページを共有する */
export async function shareGameStats(game: {
    gameId: number;
    title: string;
}): Promise<ShareResult | null> {
    return await share(gameTarget(game));
}

/** ゲームの統計を X へ投稿する */
export function postGameStatsToX(game: {
    gameId: number;
    title: string;
}): void {
    openX(gameTarget(game));
}

/**
 * プレイヤーの記録ページ（公開 URL）を共有する。
 *
 * WHY: 公開していない人の URL を配ってしまわないよう、公開中のときだけ出すのは
 * 呼ぶ側の役目。ここでは URL の組み立てと共有のしかたを揃える。
 */
export async function shareUserStats(user: {
    userId: string;
    name: string;
}): Promise<ShareResult | null> {
    return await share(userTarget(user));
}

/** プレイヤーの記録ページを X へ投稿する */
export function postUserStatsToX(user: { userId: string; name: string }): void {
    openX(userTarget(user));
}

function gameTarget(game: { gameId: number; title: string }): ShareTarget {
    return {
        path: `/game/${game.gameId}/stats`,
        // WHY: リンクだけでは何のページか分からない。開くと何が見られるかを書く
        text: `「${game.title}」でみんなが残した記録を見てみよう！ハイスコアや称号の獲得者が並んでいます。`,
        hashtags: ["みんなでゲーム", game.title],
    };
}

function userTarget(user: { userId: string; name: string }): ShareTarget {
    return {
        path: `/user/${user.userId}/stats`,
        text: `${user.name} がみんなでゲーム!で遊んだ記録と、集めた称号です。`,
        hashtags: ["みんなでゲーム"],
    };
}

/** WHY: 利用者が自分でやめたときは知らせない。null を返して何も出さない */
async function share(target: ShareTarget): Promise<ShareResult | null> {
    if (typeof window === "undefined") {
        return { severity: "error", message: "共有できませんでした。" };
    }
    const url = new URL(target.path, window.location.origin).toString();
    if (navigator.share) {
        try {
            await navigator.share({ title: target.text, url });
            return { severity: "success", message: "共有しました。" };
        } catch (err) {
            if ((err as { name?: string }).name === "AbortError") {
                return null;
            }
            console.warn("failed to share", err);
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        return {
            severity: "success",
            message: "リンクをコピーしました。",
        };
    } catch (err) {
        console.warn("failed to copy url", err);
        return { severity: "error", message: "共有できませんでした。" };
    }
}

function openX(target: ShareTarget): void {
    if (typeof window === "undefined") {
        return;
    }
    const url = new URL(target.path, window.location.origin).toString();
    const params = new URLSearchParams([
        ["text", target.text],
        ["url", url],
        ["hashtags", target.hashtags.join(",")],
    ]);
    window.open(
        `https://x.com/intent/tweet?${params.toString()}`,
        "_blank",
        "noopener,noreferrer",
    );
}
