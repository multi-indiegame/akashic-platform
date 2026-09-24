import { Alert, Container, Stack, Typography } from "@mui/material";
import { fetchFormatEditorData } from "@/lib/server/scoreboard-format-action";
import { ScoreboardFormatForm } from "@/components/scoreboard-format-form";
import { PageBackButton } from "@/components/page-back-button";
import { TitleEditLink } from "@/components/title-edit-link";

export default async function ScoreboardFormatEdit(
    props: PageProps<"/game/[id]/stats/edit">,
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
    const data = await fetchFormatEditorData(gameId);
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
                    href={`/game/${gameId}/stats`}
                    label="統計ページ"
                />
                <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: "center", flexWrap: "wrap" }}
                >
                    <Typography variant="h5" component="h1">
                        統計の見せ方
                    </Typography>
                    <TitleEditLink gameId={gameId} />
                </Stack>
                <ScoreboardFormatForm gameId={gameId} data={data} />
            </Stack>
        </Container>
    );
}
