"use client";

import {
    Box,
    Container,
    Link,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { SiteCustomFooter } from "./site-footer-custom";

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
                    <SiteCustomFooter />
                    <Stack
                        direction={{ xs: "column", lg: "row" }}
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
                            <Typography variant="body2">
                                All rights reserved.
                            </Typography>
                        </Stack>
                        <Stack
                            direction="row"
                            sx={{
                                flexWrap: "wrap",
                                // spacing は margin-left で実装されるため、
                                // 折り返した 2 行目の先頭がインデントされてしまう
                                gap: 0.5,
                                mt: 0.5,
                                justifyContent: "center",
                            }}
                        >
                            <Link href="/terms" color="inherit" variant="body2">
                                利用規約
                            </Link>
                            <Typography variant="body2"> / </Typography>
                            <Link
                                href="/privacy"
                                color="inherit"
                                variant="body2"
                            >
                                プライバシーポリシー
                            </Link>
                            <Typography variant="body2"> / </Typography>
                            <Link
                                href="/contact"
                                color="inherit"
                                variant="body2"
                            >
                                お問い合わせ
                            </Link>
                            <Typography variant="body2"> / </Typography>
                            <Link
                                href="/licenses"
                                color="inherit"
                                variant="body2"
                            >
                                素材のライセンス
                            </Link>
                            <Typography variant="body2"> / </Typography>
                            <Stack direction="row" spacing="0.5">
                                <Typography variant="body2">
                                    開発: やっしー
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
                </Stack>
            </Container>
        </Box>
    );
}
