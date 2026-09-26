"use client";

import { JSX, useState } from "react";
import { signIn } from "next-auth/react";
import { Button, Stack } from "@mui/material";
import { GitHub, Google, X } from "@mui/icons-material";
import {
    AuthProvider,
    authProviderNames,
    authProviders,
} from "@/lib/client/auth-providers";
import { verticalButtonSx } from "@/lib/client/theme";

const providerIcons: Record<AuthProvider, JSX.Element> = {
    github: <GitHub />,
    google: <Google />,
    twitter: <X />,
};

export function SignIn({
    size = "large",
}: {
    size?: "small" | "medium" | "large";
}) {
    const [sendingProvider, setSendingProvider] = useState<AuthProvider>();

    function handleClick(provider: AuthProvider) {
        if (sendingProvider) {
            return;
        }
        setSendingProvider(provider);
        signIn(provider);
    }

    return (
        <Stack
            spacing={2}
            sx={{
                width: "100%",
                alignItems: "stretch",
                ...verticalButtonSx,
            }}
        >
            {authProviders.map((provider) => (
                <Button
                    key={provider}
                    variant="contained"
                    size={size}
                    onClick={() => handleClick(provider)}
                    disabled={!!sendingProvider}
                    startIcon={providerIcons[provider]}
                    sx={{ textTransform: "none" }}
                >
                    {authProviderNames[provider]}でサインイン
                </Button>
            ))}
        </Stack>
    );
}
