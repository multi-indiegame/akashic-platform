"use client";

import {
    Box,
    Container,
    Link,
    List,
    ListItem,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import { Videocam, VideocamOff } from "@mui/icons-material";
import { useCustomData } from "@/lib/client/useCustomData";

export default function TermsPage() {
    const theme = useTheme();
    const { niconicommonsWorkUrl } = useCustomData();
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack
                spacing={1}
                sx={{
                    py: 3,
                    px: { xs: 2, sm: 4 },
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 4,
                    bgcolor: "background.paper",
                }}
            >
                <Typography
                    variant="h4"
                    component="h1"
                    sx={{
                        textAlign: "center",
                    }}
                >
                    利用規約
                </Typography>
                <Typography variant="body1" gutterBottom>
                    本利用規約（以下「本規約」といいます）は、みんなでゲーム!（以下「本サービス」といいます）の利用条件を定めるものです。
                </Typography>
                <Typography variant="h6" component="h2">
                    1. 適用
                </Typography>
                <Typography variant="body1" gutterBottom>
                    本規約は、利用者と本サービス運営者との間の本サービス利用に関わる一切の関係に適用されます。
                </Typography>
                <Typography variant="h6" component="h2">
                    2. アカウント
                </Typography>
                <Typography variant="body1" gutterBottom>
                    利用者は、正確かつ最新の情報を登録し、自己の責任でアカウントを管理するものとします。
                </Typography>
                <Typography variant="h6" component="h2">
                    3. 禁止事項
                </Typography>
                <Box>
                    <Typography variant="body1">
                        利用者は、以下の行為を行ってはなりません。
                    </Typography>
                    <List dense sx={{ listStyleType: "disc", pl: 4 }}>
                        <ListItem sx={{ display: "list-item" }}>
                            法令または公序良俗に反する行為
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            第三者の権利を侵害する行為
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            本サービスの運営を妨害する行為
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            不正アクセス、またはこれを試みる行為
                        </ListItem>
                    </List>
                </Box>
                <Typography variant="h6" component="h2">
                    4. 投稿コンテンツ
                </Typography>
                <Typography variant="body1" gutterBottom>
                    利用者は、自らが権利を有するコンテンツのみを投稿できます。投稿コンテンツの権利は原則として利用者に帰属しますが、本サービスの運営に必要な範囲で無償利用する権利を運営者に許諾するものとします。
                </Typography>
                <Typography variant="h6" component="h2">
                    5. プレイ記録と統計
                </Typography>
                <Typography variant="body1" gutterBottom>
                    本サービスは、ゲームのプレイ結果を記録し、ゲームごとの統計として公開することがあります。
                    ゲーム内で名前の入力を求められた際に名前で参加した場合、その名前および記録が統計に掲載されることに同意したものとみなします。
                    匿名で参加した場合、名前は掲載されません。
                    サインインして参加した場合、掲載はマイページから取りやめることができます。
                    ゲストとして参加した場合、掲載を後から取りやめることはできません。
                    なお、記録の内容は各ゲームの投稿者が定めるものであり、運営者はその正確性を保証しません。
                </Typography>
                <Typography variant="h6" component="h2" id="streaming">
                    6. 実況・配信・動画投稿
                </Typography>
                <Typography variant="body1" gutterBottom>
                    本サービスで公開されているゲームの実況・配信・動画投稿（以下「配信等」といいます）の取り扱いは、以下のとおりとします。
                </Typography>
                <Typography variant="subtitle1" component="h3">
                    (1) 配信可否の表示
                </Typography>
                <Box>
                    <Typography variant="body1">
                        配信等を許可するかどうかは、ゲームごとに投稿者が設定しています。各ゲームの配信可否は、以下の表示で確認できます。
                    </Typography>
                    <Stack spacing={1} sx={{ my: 1, pl: 2 }}>
                        <Stack direction="row" spacing={2}>
                            <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{
                                    alignItems: "center",
                                    flexShrink: 0,
                                    minWidth: "6em",
                                    height: "1.5rem",
                                    color: theme.palette.success.light,
                                }}
                            >
                                <Videocam fontSize="small" />
                                <Typography variant="body2">配信OK</Typography>
                            </Stack>
                            <Typography variant="body1">
                                プレイ画面のゲームタイトル横に表示されます。本条の定めに従って配信等を行うことができます。
                            </Typography>
                        </Stack>
                        <Stack direction="row" spacing={2}>
                            <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{
                                    alignItems: "center",
                                    flexShrink: 0,
                                    minWidth: "6em",
                                    height: "1.5rem",
                                    color: theme.palette.error.light,
                                }}
                            >
                                <VideocamOff fontSize="small" />
                                <Typography variant="body2">
                                    配信不可
                                </Typography>
                            </Stack>
                            <Typography variant="body1">
                                プレイ画面のゲームタイトル横に表示されます（ゲーム一覧では「
                                <Box
                                    component="span"
                                    sx={{ color: theme.palette.error.main }}
                                >
                                    実況不可
                                </Box>
                                」と表示されます）。このゲームの配信等はできません。
                            </Typography>
                        </Stack>
                    </Stack>
                    <Typography variant="body1" gutterBottom>
                        配信可否の設定は、投稿者によって変更されることがあります。配信等を行う際は、その時点の表示を確認してください。
                        また、投稿者がゲームの説明欄等において配信等に条件を付けている場合は、その条件に従ってください。
                    </Typography>
                </Box>
                <Typography variant="subtitle1" component="h3">
                    (2) 許可する範囲
                </Typography>
                <Box>
                    <Typography variant="body1">
                        「配信OK」と表示されているゲームについて、利用者は、運営者および投稿者への事前の申請や連絡を行うことなく、以下の配信等を行うことができます。
                    </Typography>
                    <List dense sx={{ listStyleType: "disc", pl: 4 }}>
                        <ListItem sx={{ display: "list-item" }}>
                            YouTube、ニコニコ生放送、ニコニコ動画、その他の動画投稿サイト・ライブ配信サイトでのライブ配信
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            上記のサイトへのプレイ動画（実況動画、切り抜き動画を含みます）の投稿
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            配信等のサムネイルや告知における、プレイ画面の画像の使用
                        </ListItem>
                    </List>
                    <Typography variant="body1" gutterBottom>
                        配信等は、収益化の有無を問わず行うことができます。広告収益、投げ銭、メンバーシップ、各サイトの収益化プログラム等による収益を得ることも可能です。
                        ただし、法人・団体による商業目的の利用（テレビ等での放送、広告・宣伝への使用等）を希望する場合は、事前に
                        <Link
                            href="/contact"
                            sx={{ color: theme.palette.primary.light }}
                        >
                            お問い合わせフォーム
                        </Link>
                        よりご相談ください。
                    </Typography>
                </Box>
                <Typography variant="subtitle1" component="h3">
                    (3) 配信等を行う際の条件
                </Typography>
                <Box>
                    <Typography variant="body1">
                        配信等を行う利用者は、以下の条件を守るものとします。
                    </Typography>
                    <List dense sx={{ listStyleType: "disc", pl: 4 }}>
                        <ListItem sx={{ display: "list-item" }}>
                            配信等は、本サービスの画面を通じてプレイした内容に限ります。ゲームのデータや素材を抜き出して配布・転載してはなりません。
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            配信等を行うサイトの利用規約・ガイドラインを守ってください。
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            マルチプレイでは、他の参加者のプレイヤー名や入力内容が画面に映ることがあります。他の参加者を誹謗中傷したり、晒したりする目的で配信等を行ってはなりません。
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            部屋のURL等が映ると、視聴者がその部屋に参加できる場合があります。視聴者の参加を望まない場合は、映らないようご注意ください。
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            ゲーム、投稿者または本サービスを不当に貶める目的での配信等、自らが制作したゲームであるかのように偽る表示、運営者や投稿者の公式な配信等であると誤認させる表示を行ってはなりません。
                        </ListItem>
                        <ListItem sx={{ display: "list-item" }}>
                            権利上の問題等を理由に、投稿者または運営者から配信等の中止や動画の削除を求められた場合は、速やかに応じてください。
                        </ListItem>
                    </List>
                </Box>
                <Typography variant="subtitle1" component="h3">
                    (4) お願い（任意）
                </Typography>
                <Box>
                    <Typography variant="body1">
                        以下は義務ではありませんが、ご協力いただけると本サービスおよび投稿者の励みになります。
                    </Typography>
                    <List dense sx={{ listStyleType: "disc", pl: 4 }}>
                        <ListItem sx={{ display: "list-item" }}>
                            配信等の概要欄などに、本サービス名（みんなでゲーム!）、ゲームのタイトル、投稿者名、ゲームページのURLを記載してください。
                        </ListItem>
                        {niconicommonsWorkUrl && (
                            <ListItem sx={{ display: "list-item" }}>
                                ニコニコ生放送・ニコニコ動画で配信等を行う場合は、
                                <Link
                                    href={niconicommonsWorkUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{ color: theme.palette.primary.light }}
                                >
                                    本サービスの作品
                                </Link>
                                を親作品として登録してください。親作品登録はサーバーの稼働維持に役立ちます。
                            </ListItem>
                        )}
                    </List>
                </Box>
                <Typography variant="h6" component="h2">
                    7. 免責事項
                </Typography>
                <Typography variant="body1" gutterBottom>
                    本サービスは、提供する情報や機能の完全性・正確性を保証しません。利用者に生じた損害について、運営者は一切の責任を負いません。
                </Typography>
                <Typography variant="h6" component="h2">
                    8. 通報と対応
                </Typography>
                <Typography variant="body1" gutterBottom>
                    利用者は、他の利用者の投稿・部屋・アカウントが本規約に違反すると考える場合、本サービス上の通報機能により運営者へ報告できます。運営者は、通報の有無にかかわらず、違反または不適切と判断した投稿・部屋・アカウントについて、削除・利用制限・入室制限（BAN）等の措置を、事前の通知なく講じることがあります。
                </Typography>
                <Typography variant="h6" component="h2">
                    9. 規約の変更
                </Typography>
                <Typography variant="body1" gutterBottom>
                    運営者は、必要と判断した場合には、本規約を変更することができます。変更後の規約は本サービス上に表示した時点から効力を生じます。
                </Typography>
                <Typography variant="h6" component="h2">
                    10. お問い合わせ
                </Typography>
                <Typography variant="body1" gutterBottom>
                    本規約に関するお問い合わせは、
                    <Link
                        href="/contact"
                        sx={{ color: theme.palette.primary.light }}
                    >
                        お問い合わせフォーム
                    </Link>
                    よりご連絡ください。
                </Typography>
                <Typography variant="body2">
                    2026年2月4日 制定, 2026年7月26日 改定, 2026年9月24日 改定,
                    2026年9月28日 改定
                </Typography>
            </Stack>
        </Container>
    );
}
