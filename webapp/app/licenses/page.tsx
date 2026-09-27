import type { Metadata } from "next";
import { Container, Divider, Link, Stack, Typography } from "@mui/material";

export const metadata: Metadata = {
    title: "素材のライセンス - みんなでゲーム!",
    description:
        "みんなでゲーム! が使っている素材と、そのライセンスの表記です。",
};

/**
 * サービスが使っている素材のライセンス。
 *
 * WHY: 称号の段位の絵のように、特定のゲームに属さない素材はここへ集める。
 * ゲームごとのクレジットは、それぞれのゲームの詳細に出る。
 */
export default function LicensesPage() {
    return (
        <Container maxWidth="md" sx={{ py: 2 }}>
            <Stack spacing={2}>
                <Typography variant="h5" component="h1">
                    素材のライセンス
                </Typography>
                <Typography variant="body2" color="textSecondary">
                    みんなでゲーム! が使っている素材と、その表記です。投稿された
                    ゲームが使っている素材については、それぞれのゲームの詳細にある
                    クレジットをご覧ください。
                </Typography>
                <Divider />
                <Stack spacing={1}>
                    <Typography variant="h6" component="h2">
                        称号の段位の画像
                    </Typography>
                    <Typography variant="body2">
                        ブロンズ・シルバー・ゴールドの画像は、M PLUS 1
                        を用いて作成しています。
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        M PLUS 1 / Copyright 2021 The M PLUS Project Authors
                        （SIL Open Font License 1.1）
                    </Typography>
                    <Link
                        href="https://openfontlicense.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="body2"
                    >
                        SIL Open Font License 1.1
                    </Link>
                </Stack>
            </Stack>
        </Container>
    );
}
