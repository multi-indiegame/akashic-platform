"use client";

import Link from "next/link";
import { Avatar, Stack, Typography, TypographyProps } from "@mui/material";

type InlineUser = {
    id?: string;
    name: string;
    image?: string;
};

export function UserInline({
    user,
    avatarSize = 24,
    textVariant = "body2",
    openInNewWindow = false,
}: {
    user: InlineUser;
    avatarSize?: number;
    textVariant?: TypographyProps["variant"];
    openInNewWindow?: boolean;
}) {
    const content = (
        <Stack
            direction="row"
            spacing={1}
            sx={{
                alignItems: "center",
            }}
        >
            {user.image && (
                <Avatar
                    src={user.image}
                    alt={user.name}
                    sx={{
                        width: avatarSize,
                        height: avatarSize,
                        flexShrink: 0,
                    }}
                />
            )}
            <Typography variant={textVariant}>{user.name}</Typography>
        </Stack>
    );

    if (!user.id) {
        return content;
    }

    return (
        <Link
            href={`/user/${user.id}`}
            target={openInNewWindow ? "_blank" : undefined}
            rel={openInNewWindow ? "noopener noreferrer" : undefined}
            style={{ textDecoration: "none", color: "inherit" }}
        >
            {content}
        </Link>
    );
}
