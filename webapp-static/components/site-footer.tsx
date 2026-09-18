"use client";

import {
    Box,
    Container,
    Link,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";

export function SiteFooter() {
    const theme = useTheme();

    return (
        <Box
            component="footer"
            sx={{
                borderTop: 1,
                bgcolor: theme.palette.background.paper,
                borderColor: theme.palette.background.default,
            }}
        >
            <Container maxWidth="xl">
                <Stack>
                    <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={{
                            xs: 0,
                            md: 1,
                        }}
                        sx={{
                            textAlign: "center",
                            justifyContent: "center",
                            color: theme.palette.text.secondary,
                        }}
                    >
                        <Stack
                            direction="row"
                            sx={{ justifyContent: "center" }}
                            spacing={1}
                        >
                            <Typography variant="body2">
                                © 2026 みんなでゲーム!
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{
                                    display: { xs: "none", sm: "inherit" },
                                }}
                            >
                                All rights reserved.
                            </Typography>
                        </Stack>
                        <Stack
                            direction="row"
                            sx={{ justifyContent: "center" }}
                            spacing={{ xs: 0.5, sm: 1 }}
                        >
                            <Typography variant="body2">問い合わせ:</Typography>
                            <Typography
                                variant="body2"
                                sx={{
                                    display: { xs: "none", sm: "inherit" },
                                }}
                            >
                                やっしー
                            </Typography>
                            <Link
                                href="https://x.com/yasshi2525"
                                target="_blank"
                                color="inherit"
                                variant="body2"
                            >
                                X
                            </Link>
                            <Typography variant="body2">, </Typography>
                            <Link
                                href="https://github.com/multi-indiegame/akashic-platform"
                                target="_blank"
                                color="inherit"
                                variant="body2"
                            >
                                GitHub
                            </Link>
                        </Stack>
                    </Stack>
                </Stack>
            </Container>
        </Box>
    );
}
