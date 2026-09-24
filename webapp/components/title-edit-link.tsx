"use client";

import Link from "next/link";
import { Button } from "@mui/material";
import { EmojiEvents } from "@mui/icons-material";

export function TitleEditLink({ gameId }: { gameId: number }) {
    return (
        <Button
            variant="outlined"
            component={Link}
            href={`/game/${gameId}/stats/titles`}
            startIcon={<EmojiEvents />}
            sx={{ ml: "auto" }}
        >
            称号の設定
        </Button>
    );
}
