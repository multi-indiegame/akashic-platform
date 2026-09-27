"use client";

import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    Collapse,
    Container,
    Divider,
    Skeleton,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { useLicense } from "@/lib/client/useLicense";

export function CreditPanel({
    credit,
    contentId,
    titleCredits,
}: {
    credit?: string;
    contentId: number;
    /** 称号の画像に添えるクレジット。ゲームのクレジットと同じ場所に並べる */
    titleCredits?: { name: string; credit: string }[];
}) {
    const theme = useTheme();
    const [open, setOpen] = useState(false);
    const { license, isLoading, error } = useLicense(contentId);

    return (
        <Stack spacing={1}>
            <Button
                variant="outlined"
                size="small"
                onClick={() => setOpen((prev) => !prev)}
                endIcon={open ? <ExpandLess /> : <ExpandMore />}
                sx={{
                    alignSelf: "flex-start",
                    borderColor: theme.palette.text.secondary,
                    color: theme.palette.text.secondary,
                }}
            >
                {open ? "クレジットを閉じる" : "クレジットを表示"}
            </Button>
            <Collapse in={open}>
                <Stack spacing={1}>
                    {credit && (
                        <Box>
                            <Typography variant="subtitle2">
                                クレジット
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{ whiteSpace: "pre-wrap" }}
                            >
                                {credit}
                            </Typography>
                        </Box>
                    )}
                    {titleCredits && titleCredits.length > 0 && (
                        <>
                            {credit && <Divider />}
                            <Box>
                                <Typography variant="subtitle2">
                                    称号の画像
                                </Typography>
                                {titleCredits.map((title) => (
                                    <Typography
                                        key={title.name}
                                        variant="body2"
                                        sx={{ whiteSpace: "pre-wrap" }}
                                    >
                                        {title.name}: {title.credit}
                                    </Typography>
                                ))}
                            </Box>
                        </>
                    )}
                    {(credit || (titleCredits && titleCredits.length > 0)) &&
                        license && <Divider />}
                    {isLoading && (
                        <Container maxWidth="md" sx={{ py: 2 }}>
                            <Skeleton variant="rectangular" height={240} />
                        </Container>
                    )}
                    {error && (
                        <Alert variant="outlined" severity="error">
                            ライセンスファイルの読み込みに失敗しました。
                        </Alert>
                    )}
                    {license && (
                        <Box>
                            <Typography variant="subtitle2">
                                ライブラリライセンス
                            </Typography>
                            <Typography
                                variant="body2"
                                color="textSecondary"
                                sx={{
                                    fontSize: "small",
                                    fontFamily: "monospace",
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {license}
                            </Typography>
                        </Box>
                    )}
                </Stack>
            </Collapse>
        </Stack>
    );
}
