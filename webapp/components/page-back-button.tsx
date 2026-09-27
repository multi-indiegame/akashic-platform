"use client";

import Link from "next/link";
import { Button, Typography } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";

export function PageBackButton({
    href,
    label,
}: {
    href: string;
    label: string;
}) {
    return (
        <Button
            component={Link}
            href={href}
            variant="text"
            size="large"
            startIcon={<ArrowBack fontSize="large" />}
            sx={{ color: "inherit" }}
        >
            <Typography variant="h6">{label}</Typography>
        </Button>
    );
}
