"use client";

import { useState } from "react";
import { Alert, Button, Snackbar, Stack } from "@mui/material";
import { Share, X } from "@mui/icons-material";
import {
    ShareResult,
    postUserStatsToX,
    shareUserStats,
} from "@/lib/client/share-stats";
import { PageBackButton } from "./page-back-button";

/**
 * プレイヤーの記録ページの見出し。
 *
 * WHY: このページは公開されているときだけ開けるので、共有の口をそのまま置く。
 */
export function UserStatsHeader({
    userId,
    userName,
}: {
    userId: string;
    userName: string;
}) {
    const [notice, setNotice] = useState<ShareResult | null>(null);
    return (
        <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
            <PageBackButton href={`/user/${userId}`} label="プロフィール" />
            <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
                <Button
                    variant="outlined"
                    startIcon={<Share />}
                    onClick={async () =>
                        setNotice(
                            await shareUserStats({ userId, name: userName }),
                        )
                    }
                >
                    共有する
                </Button>
                <Button
                    variant="outlined"
                    startIcon={<X />}
                    onClick={() => postUserStatsToX({ userId, name: userName })}
                >
                    シェア
                </Button>
            </Stack>
            <Snackbar
                open={!!notice}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
            >
                <Alert
                    variant="filled"
                    severity={notice?.severity ?? "success"}
                    onClose={() => setNotice(null)}
                >
                    {notice?.message}
                </Alert>
            </Snackbar>
        </Stack>
    );
}
