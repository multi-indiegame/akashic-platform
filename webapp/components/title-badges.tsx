"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
    Avatar,
    Button,
    ButtonBase,
    CardActionArea,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Tooltip,
    Typography,
    useTheme,
} from "@mui/material";
import { EmojiEvents } from "@mui/icons-material";
import { format } from "date-fns";
import { TitleBadge } from "@/lib/types";
import {
    TITLE_RANK_COLOR,
    TITLE_RANK_LIGHT_COLOR,
    titleRankLabel,
} from "@/lib/share/title-rank";
import { useTitleRankImageUrl } from "@/lib/client/useTitleRankImageUrl";
import {
    TitleConditionsResponse,
    fetchTitleConditions,
} from "@/lib/server/scoreboard-title-action";

export const TITLE_TILE_SIZE = 100;

const containImg = {
    img: {
        style: {
            objectFit: "contain",
            width: "100%",
            height: "100%",
        },
    },
} as const;

/**
 * WHY: ネイティブ全画面中は全画面要素の外 (body) に描画すると見えないため、
 * 全画面要素があればそこへ描画する
 */
function portalContainer(): HTMLElement {
    const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
    };
    return (doc.fullscreenElement ??
        doc.webkitFullscreenElement ??
        document.body) as HTMLElement;
}

export function TitleBadges({
    titles,
    variant = "full",
    iconSize = 22,
    withGameName = true,
    openInNewWindow = false,
    disableDetail = false,
}: {
    titles: TitleBadge[];
    /** compact は部屋の中など狭い場所向け。画像の枠の色だけで段位を示す */
    variant?: "full" | "compact";
    /** compact のときの画像の大きさ (px) */
    iconSize?: number;
    /** ゲームごとに区切って並べるときは、1 つずつに添えなくてよい */
    withGameName?: boolean;
    /** 部屋の中から開くときは、部屋を離れないよう別タブにする */
    openInNewWindow?: boolean;
    /** 流れて消える表示の中では、押しても詳細を開かない */
    disableDetail?: boolean;
}) {
    const [selected, setSelected] = useState<TitleBadge>();
    if (titles.length === 0) {
        return null;
    }
    return (
        <>
            <Stack
                direction="row"
                sx={{
                    // WHY: 流れるコメントの中では幅が決まらず、折り返しを許すと 1 つずつ縦に積まれて隠れる
                    flexWrap: variant === "full" ? "wrap" : "nowrap",
                    gap: variant === "full" ? 2 : 0.5,
                    alignItems: variant === "full" ? "flex-start" : "center",
                }}
            >
                {titles.map((title) =>
                    variant === "full" ? (
                        <TitleTile
                            key={`${title.gameId}-${title.categoryKey}`}
                            title={title}
                            withGameName={withGameName}
                            onClick={() => setSelected(title)}
                        />
                    ) : (
                        <TitleIcon
                            key={`${title.gameId}-${title.categoryKey}`}
                            title={title}
                            size={iconSize}
                            onClick={
                                disableDetail
                                    ? undefined
                                    : () => setSelected(title)
                            }
                        />
                    ),
                )}
            </Stack>
            {selected && (
                <TitleDetailDialog
                    title={selected}
                    openInNewWindow={openInNewWindow}
                    onClose={() => setSelected(undefined)}
                />
            )}
        </>
    );
}

export function TitleArt({
    title,
    size,
}: {
    title: Pick<TitleBadge, "name" | "rank" | "imageURL">;
    size: number;
}) {
    const toRankImageUrl = useTitleRankImageUrl();
    const color = TITLE_RANK_COLOR[title.rank];
    return (
        <Stack spacing={0} sx={{ alignItems: "center" }}>
            <Avatar
                src={title.imageURL}
                alt={title.name}
                variant="rounded"
                sx={{ width: size, height: size }}
                slotProps={containImg}
            >
                <EmojiEvents sx={{ fontSize: size / 2 }} />
            </Avatar>
            {title.rank !== "NONE" && (
                <Avatar
                    src={toRankImageUrl(title.rank)}
                    alt={titleRankLabel(title.rank)}
                    variant="square"
                    sx={{
                        width: size,
                        height: size * 0.4,
                        bgcolor: "transparent",
                    }}
                    slotProps={containImg}
                >
                    <Chip
                        size="small"
                        variant="outlined"
                        label={titleRankLabel(title.rank)}
                        sx={{ color, borderColor: color }}
                    />
                </Avatar>
            )}
        </Stack>
    );
}

function TitleTile({
    title,
    withGameName,
    onClick,
}: {
    title: TitleBadge;
    withGameName: boolean;
    onClick: () => void;
}) {
    return (
        <CardActionArea
            onClick={onClick}
            aria-label={`称号「${title.name}」の詳細`}
            sx={{ borderRadius: 1, width: "auto", p: 0.5 }}
        >
            <Stack
                spacing={0.5}
                sx={{ alignItems: "center", width: TITLE_TILE_SIZE }}
            >
                <TitleArt title={title} size={TITLE_TILE_SIZE} />
                <Typography
                    variant="body2"
                    sx={{ textAlign: "center", overflowWrap: "anywhere" }}
                >
                    {title.name}
                </Typography>
                {withGameName && (
                    // WHY: どのゲームの称号かを必ず添える。運営が出した肩書きに見えないようにする
                    <Typography
                        variant="caption"
                        color="textSecondary"
                        sx={{ textAlign: "center", overflowWrap: "anywhere" }}
                    >
                        {title.gameTitle}
                    </Typography>
                )}
            </Stack>
        </CardActionArea>
    );
}

function TitleIcon({
    title,
    size,
    onClick,
}: {
    title: TitleBadge;
    size: number;
    onClick?: () => void;
}) {
    const theme = useTheme();
    const color = TITLE_RANK_LIGHT_COLOR[title.rank];
    const icon = (
        <Avatar
            src={title.imageURL}
            alt={onClick ? "" : title.name}
            variant="rounded"
            sx={{
                width: size,
                height: size,
                flexShrink: 0,
                boxSizing: "border-box",
                border: `2px solid ${color ?? theme.palette.divider}`,
            }}
            slotProps={containImg}
        >
            <EmojiEvents sx={{ fontSize: size * 0.7, color }} />
        </Avatar>
    );
    if (!onClick) {
        return icon;
    }
    return (
        // WHY: どのゲームの称号かを必ず添える。運営が出した肩書きに見えないようにする
        <Tooltip
            title={`${title.name}（${title.gameTitle} の称号）`}
            slotProps={{ popper: { container: portalContainer } }}
        >
            <ButtonBase
                onClick={onClick}
                aria-label={`称号「${title.name}」の詳細`}
                sx={{ borderRadius: 1, flexShrink: 0 }}
            >
                {icon}
            </ButtonBase>
        </Tooltip>
    );
}

function TitleDetailDialog({
    title,
    openInNewWindow,
    onClose,
}: {
    title: TitleBadge;
    openInNewWindow: boolean;
    onClose: () => void;
}) {
    const [conditions, setConditions] = useState<TitleConditions | "error">();

    useEffect(() => {
        let active = true;
        fetchTitleConditions(title.defId)
            .then((res) => {
                if (active) {
                    setConditions(res.ok ? res.data : "error");
                }
            })
            .catch(() => {
                if (active) {
                    setConditions("error");
                }
            });
        return () => {
            active = false;
        };
    }, [title.defId]);

    return (
        <Dialog
            open
            fullWidth
            maxWidth="xs"
            onClose={onClose}
            container={portalContainer}
        >
            <DialogTitle>{title.name}</DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <TitleArt title={title} size={160} />
                    <Stack spacing={0.5}>
                        <Detail label="ゲーム">
                            <Link
                                href={`/game/${title.gameId}`}
                                target={openInNewWindow ? "_blank" : undefined}
                                rel={
                                    openInNewWindow
                                        ? "noopener noreferrer"
                                        : undefined
                                }
                                style={{ color: "inherit" }}
                            >
                                {title.gameTitle}
                            </Link>
                        </Detail>
                        {title.rank !== "NONE" && (
                            <Detail label="段位">
                                {titleRankLabel(title.rank)}
                            </Detail>
                        )}
                        <Detail label="獲得日">
                            {format(new Date(title.awardedAt), "yyyy/MM/dd")}
                        </Detail>
                        <Detail label="獲得条件">
                            {conditions === undefined ? (
                                <CircularProgress size={16} />
                            ) : conditions === "error" ? (
                                "読み込みに失敗しました。"
                            ) : (
                                <ConditionBody conditions={conditions} />
                            )}
                        </Detail>
                    </Stack>
                </Stack>
                <DialogActions>
                    <Button
                        variant="outlined"
                        color="inherit"
                        onClick={onClose}
                    >
                        閉じる
                    </Button>
                </DialogActions>
            </DialogContent>
        </Dialog>
    );
}

type TitleConditions = Extract<TitleConditionsResponse, { ok: true }>["data"];

function ConditionBody({ conditions }: { conditions: TitleConditions }) {
    switch (conditions.kind) {
        case "hidden":
            return (
                <Typography variant="body2" color="textSecondary">
                    非公開
                </Typography>
            );
        case "text":
            return (
                <span style={{ whiteSpace: "pre-wrap" }}>
                    {conditions.text}
                </span>
            );
        case "conditions":
            if (conditions.conditions.length === 0) {
                return "条件が設定されていません。";
            }
            return (
                <>
                    {conditions.conditions.map((text, index) => (
                        <div key={index}>{text}</div>
                    ))}
                    {conditions.conditions.length > 1 && (
                        <Typography variant="caption" color="textSecondary">
                            すべて満たすと獲得できます。
                        </Typography>
                    )}
                </>
            );
    }
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Stack direction="row" spacing={2} sx={{ alignItems: "baseline" }}>
            <Typography
                variant="caption"
                color="textSecondary"
                sx={{ minWidth: 56, flexShrink: 0 }}
            >
                {label}
            </Typography>
            <Typography variant="body2" component="div">
                {children}
            </Typography>
        </Stack>
    );
}
