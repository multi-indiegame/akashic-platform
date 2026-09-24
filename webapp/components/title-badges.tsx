"use client";

import { Avatar, Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import type { ScoreTitleRank } from "@multi-indiegame/persist-schema";
import { TitleBadge } from "@/lib/types";
import { useTitleRankImageUrl } from "@/lib/client/useTitleRankImageUrl";

/**
 * 段位の色。サービス側で用意するラベルなので、ゲームごとに変えない。
 */
const RANK_COLOR: { [key in ScoreTitleRank]: string | undefined } = {
    NONE: undefined,
    BRONZE: "#9C6B3F",
    SILVER: "#6E7A88",
    GOLD: "#A8801C",
};

export function TitleBadges({
    titles,
    size = "small",
    withGameName = true,
}: {
    titles: TitleBadge[];
    size?: "small" | "medium";
    /** ゲームごとに区切って並べるときは、1 つずつに添えなくてよい */
    withGameName?: boolean;
}) {
    if (titles.length === 0) {
        return null;
    }
    return (
        <Stack
            direction="row"
            spacing={0.5}
            sx={{ flexWrap: "wrap", gap: 0.5 }}
        >
            {titles.map((title) => (
                <TitleChip
                    key={`${title.gameId}-${title.categoryKey}`}
                    title={title}
                    size={size}
                    withGameName={withGameName}
                />
            ))}
        </Stack>
    );
}

function TitleChip({
    title,
    size,
    withGameName,
}: {
    title: TitleBadge;
    size: "small" | "medium";
    withGameName: boolean;
}) {
    const color = RANK_COLOR[title.rank];
    const toRankImageUrl = useTitleRankImageUrl();
    return (
        // WHY: どのゲームの称号かを必ず添える。運営が出した肩書きに見えないようにする
        <Tooltip
            title={
                withGameName
                    ? `${title.gameTitle} の称号`
                    : `${title.name}（${title.gameTitle}）`
            }
        >
            <Chip
                size={size}
                variant="outlined"
                avatar={
                    <>
                        {title.imageURL && (
                            <Avatar src={title.imageURL} alt="" />
                        )}
                        {<Avatar src={toRankImageUrl(title.rank)} alt="" />}
                    </>
                }
                label={
                    <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ alignItems: "center" }}
                    >
                        {color && (
                            <Box
                                component="span"
                                sx={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    letterSpacing: "0.08em",
                                    color,
                                    border: `1px solid ${color}`,
                                    borderRadius: 999,
                                    px: 0.75,
                                }}
                            >
                                {title.rank}
                            </Box>
                        )}
                        <Typography variant="caption">{title.name}</Typography>
                    </Stack>
                }
            />
        </Tooltip>
    );
}
