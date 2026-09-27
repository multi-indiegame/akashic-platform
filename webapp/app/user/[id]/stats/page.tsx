import type { Metadata } from "next";
import { Alert, Container, Stack, Typography } from "@mui/material";
import { prisma } from "@multi-indiegame/persist-schema";
import { publicBaseUrl } from "@/lib/server/akashic";
import { fetchMyScoreboard } from "@/lib/server/scoreboard-mypage";
import { MyScoreboardView } from "@/components/my-scoreboard";
import { UserStatsHeader } from "@/components/user-stats-header";

/**
 * 共有用の公開ページ。
 *
 * WHY: 公開は本人が明示的に選んだときだけ。名前掲載の同意はゲーム単位の掲載への
 * 同意であって、横断プロフィールの公開は別途同意が必要。
 */
async function fetchPublicUser(userId: string) {
    return await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            image: true,
            scoreboardPublic: true,
        },
    });
}

export async function generateMetadata(
    props: PageProps<"/user/[id]/stats">,
): Promise<Metadata> {
    const { id } = await props.params;
    const user = await fetchPublicUser(id);
    if (!user?.scoreboardPublic) {
        return { title: "みんなでゲーム!" };
    }
    const title = `${user.name} さんの記録 - みんなでゲーム!`;
    const description = `${user.name} さんが遊んだゲームの記録と称号。`;
    return {
        metadataBase: new URL(publicBaseUrl),
        title,
        description,
        openGraph: {
            title,
            description,
            type: "profile",
            url: `/user/${user.id}/stats`,
        },
    };
}

export default async function UserStatsPage(
    props: PageProps<"/user/[id]/stats">,
) {
    const { id } = await props.params;
    const user = await fetchPublicUser(id);
    if (!user?.scoreboardPublic) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Alert variant="outlined" severity="info">
                    このページは公開されていません。
                </Alert>
            </Container>
        );
    }
    const data = await fetchMyScoreboard(user.id);
    return (
        <Container maxWidth="md" sx={{ py: 2 }}>
            <Stack spacing={2}>
                <UserStatsHeader
                    userId={user.id}
                    userName={user.name ?? "退会したユーザー"}
                />
                <Typography variant="h5" component="h1">
                    {user.name} さんの記録と称号
                </Typography>
                <MyScoreboardView
                    data={data}
                    user={{
                        id: user.id,
                        name: user.name ?? "退会したユーザー",
                        image: user.image ?? undefined,
                    }}
                />
            </Stack>
        </Container>
    );
}
