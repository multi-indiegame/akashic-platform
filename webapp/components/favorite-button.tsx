"use client";

import { useState } from "react";
import {
    Alert,
    CircularProgress,
    IconButton,
    Snackbar,
    Tooltip,
    useTheme,
} from "@mui/material";
import { Star, StarBorder } from "@mui/icons-material";
import { useAuth } from "@/lib/client/useAuth";
import { addFavorite, deleteFavorite } from "@/lib/server/favorite-action";

export function FavoriteButton({
    gameId,
    initialFavorited,
    size = "large",
}: {
    gameId: number;
    initialFavorited: boolean;
    size?: "small" | "medium" | "large";
}) {
    const theme = useTheme();
    const [user] = useAuth();
    const [isFavorited, setFavorited] = useState(initialFavorited);
    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState<string>();

    if (!user || user.authType === "guest") {
        return null;
    }

    async function handleClick(e: React.MouseEvent) {
        e.stopPropagation();
        if (isUpdating) {
            return;
        }
        setIsUpdating(true);
        try {
            const res = isFavorited
                ? await deleteFavorite(gameId)
                : await addFavorite(gameId);
            if (res.ok) {
                setFavorited((prev) => !prev);
            } else {
                switch (res.reason) {
                    case "AlreadyExists":
                        setFavorited(true);
                        setError("すでにお気に入りに追加されています。");
                        break;
                    case "NotFound":
                        setError(
                            "お気に入りに追加するゲームが見つかりません。画面を更新してください。",
                        );
                        break;
                    case "Unauthorized":
                        setError(
                            "サインインの有効期限が切れました。ページを更新してサインインし直してください。",
                        );
                        break;
                    case "Drain":
                        setError(
                            "現在臨時メンテナンス中のため、お気に入り操作ができません。1時間ほど時間をおいてください。",
                        );
                        break;
                    case "InternalError":
                    default:
                        setError(
                            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
                        );
                        break;
                }
            }
        } catch (err) {
            // 通信断などで Action 自体が失敗しても、ボタンが無効のまま固まらないようにする
            console.warn("failed to toggle favorite", err);
            setError(
                "予期しないエラーが発生しました。時間をおいてリトライしてください。",
            );
        } finally {
            setIsUpdating(false);
        }
    }
    return (
        <>
            <Tooltip
                arrow
                title={isFavorited ? "お気に入りから削除" : "お気に入りに追加"}
            >
                <IconButton
                    aria-label={
                        isFavorited ? "お気に入りから削除" : "お気に入りに追加"
                    }
                    onClick={handleClick}
                    disabled={isUpdating}
                    size={size}
                >
                    {isUpdating ? (
                        <CircularProgress
                            size={
                                size === "small"
                                    ? 18
                                    : size === "medium"
                                      ? 24
                                      : 36
                            }
                        />
                    ) : isFavorited ? (
                        <Star
                            fontSize={size}
                            sx={{ color: theme.palette.warning.light }}
                        />
                    ) : (
                        <StarBorder
                            fontSize={size}
                            sx={{ color: theme.palette.warning.light }}
                        />
                    )}
                </IconButton>
            </Tooltip>
            {error && (
                <Snackbar
                    open={!!error}
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
                    onClose={() => setError(undefined)}
                >
                    <Alert severity="error">{error}</Alert>
                </Snackbar>
            )}
        </>
    );
}
