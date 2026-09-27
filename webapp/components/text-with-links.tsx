"use client";

import { MouseEvent, useLayoutEffect, useRef, useState } from "react";
import { Button, Link, Stack, Typography, useTheme } from "@mui/material";
import { OpenInNew, ExpandLess, ExpandMore } from "@mui/icons-material";

const URL_REGEX = /(https?:\/\/[^\s\u3000-\u9fff\uff00-\uffef<>'"]+)/g;
const TRAILING_PUNCT = /[.,;:!?)>\]'"」）。、！？…]+$/;

export function GameDescription({
    description,
    gameId,
    expanded,
    onToggle,
}: {
    description: string;
    gameId: number;
    expanded: boolean;
    onToggle: (e: MouseEvent, id: number) => void;
}) {
    const theme = useTheme();
    const textRef = useRef<HTMLElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    useLayoutEffect(() => {
        const el = textRef.current;
        if (!el || expanded) return;

        function check() {
            if (el) setIsTruncated(el.scrollHeight > el.clientHeight);
        }
        check();

        const observer = new ResizeObserver(check);
        observer.observe(el);
        return () => observer.disconnect();
    }, [expanded, description]);

    return (
        <Stack spacing={0.5}>
            <Typography
                ref={textRef}
                variant="body2"
                color="textSecondary"
                sx={{
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    ...(expanded
                        ? { whiteSpace: "pre-wrap" }
                        : {
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                          }),
                }}
            >
                {renderTextWithLinks(description)}
            </Typography>
            {isTruncated && (
                <Button
                    startIcon={expanded ? <ExpandLess /> : <ExpandMore />}
                    size="small"
                    onClick={(e) => onToggle(e, gameId)}
                    sx={{
                        alignSelf: "flex-start",
                        p: 0,
                        minWidth: 0,
                        color: theme.palette.primary.light,
                    }}
                >
                    {expanded ? "折りたたむ" : "もっと見る"}
                </Button>
            )}
        </Stack>
    );
}

export function renderTextWithLinks(text: string) {
    const parts = text.split(URL_REGEX);
    const result: React.ReactNode[] = [];

    parts.forEach((part, i) => {
        if (i % 2 === 1) {
            const url = part.replace(TRAILING_PUNCT, "");
            const trailing = part.slice(url.length);
            result.push(
                <Link
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                        wordBreak: "break-all",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.25,
                    }}
                >
                    {url}
                    <OpenInNew sx={{ fontSize: "0.9em", flexShrink: 0 }} />
                </Link>,
            );
            if (trailing) result.push(trailing);
        } else {
            result.push(part);
        }
    });

    return result;
}
