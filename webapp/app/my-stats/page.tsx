import { Alert, Container, Stack, Typography } from "@mui/material";
import { getSignedInUser } from "@/lib/server/auth";
import { fetchMyScoreboard } from "@/lib/server/scoreboard-mypage";
import { MyScoreboardView } from "@/components/my-scoreboard";
import { MyScoreboardSettings } from "@/components/my-scoreboard-settings";
import { prisma } from "@multi-indiegame/persist-schema";

export default async function MyStatsPage() {
    const auth = await getSignedInUser();
    if (!auth.ok) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Alert variant="outlined" severity="info">
                    自分の記録を見るにはサインインが必要です。
                </Alert>
            </Container>
        );
    }
    const [data, profile] = await Promise.all([
        fetchMyScoreboard(auth.user.id),
        prisma.user.findUnique({
            where: { id: auth.user.id },
            select: { scoreboardPublic: true, scoreboardOptOut: true },
        }),
    ]);
    return (
        <Container maxWidth="md" sx={{ py: 2 }}>
            <Stack spacing={4}>
                <Stack spacing={2}>
                    <Typography variant="h5" component="h1">
                        自分の記録と称号
                    </Typography>
                    <MyScoreboardView data={data} />
                    <Typography variant="caption" color="textSecondary">
                        ここに記録されるのは、ゲーム内で名前を使って参加したプレイの分だけです。
                    </Typography>
                </Stack>
                <Stack spacing={2}>
                    <Typography variant="h5" component="h2">
                        公開の設定
                    </Typography>
                    <MyScoreboardSettings
                        userId={auth.user.id}
                        userName={auth.user.name}
                        initialPublic={!!profile?.scoreboardPublic}
                        initialOptOut={!!profile?.scoreboardOptOut}
                    />
                </Stack>
            </Stack>
        </Container>
    );
}
