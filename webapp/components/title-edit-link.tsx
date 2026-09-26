"use client";

import Link from "next/link";
import { Button, useTheme } from "@mui/material";
import { EmojiEvents } from "@mui/icons-material";

export function TitleEditLink({ gameId }: { gameId: number }) {
    const theme = useTheme();
    return (
        <Button
            variant="outlined"
            component={Link}
            href={`/game/${gameId}/stats/titles`}
            startIcon={<EmojiEvents />}
            sx={{
                ml: "auto",
                color: theme.palette.primary.light,
                borderColor: theme.palette.primary.light,
            }}
        >
            称号の設定
        </Button>
    );
}
