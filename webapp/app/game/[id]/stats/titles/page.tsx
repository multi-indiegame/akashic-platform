import { Alert, Container, Stack, Typography } from "@mui/material";
import { fetchTitleEditorData } from "@/lib/server/scoreboard-title-action";
import { ScoreboardTitleForm } from "@/components/scoreboard-title-form";
import { PageBackButton } from "@/components/page-back-button";

export default async function ScoreboardTitleEdit(
    props: PageProps<"/game/[id]/stats/titles">,
) {
    const { id } = await props.params;
    const gameId = Number(id);
    if (!Number.isInteger(gameId) || gameId < 0) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Alert variant="outlined" severity="error">
                    ゲームが見つかりませんでした。
                </Alert>
            </Container>
        );
    }
    const data = await fetchTitleEditorData(gameId);
    if (!data) {
        return (
            <Container maxWidth="md" sx={{ py: 2 }}>
                <Alert variant="outlined" severity="error">
                    このゲームの投稿者だけが設定できます。
                </Alert>
            </Container>
        );
    }
    return (
        <Container maxWidth="md" sx={{ py: 2 }}>
            <Stack spacing={2}>
                <PageBackButton
                    href={`/game/${gameId}/stats/edit`}
                    label="統計の見せ方"
                />
                <Typography variant="h5" component="h1">
                    称号の設定
                </Typography>
                <ScoreboardTitleForm gameId={gameId} data={data} />
            </Stack>
        </Container>
    );
}
