"use client";

import Link from "next/link";
import {
    Delete,
    FileUpload,
    OpenInNew,
    Person,
    ReadMore,
    SportsEsports,
} from "@mui/icons-material";
import {
    Box,
    Button,
    Container,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";

export default function HelpPage() {
    const theme = useTheme();
    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Stack
                spacing={3}
                sx={{
                    px: { xs: 2, sm: 4 },
                    py: 2,
                    bgcolor: theme.palette.background.paper,
                }}
            >
                <Typography
                    variant="h4"
                    component="h1"
                    sx={{
                        textAlign: "center",
                    }}
                >
                    ヘルプ
                </Typography>
                <Box>
                    <Typography variant="h6" component="h2">
                        みんなでゲーム! とは？
                    </Typography>
                    <Typography
                        variant="body1"
                        gutterBottom
                        color="textSecondary"
                        sx={{
                            pl: { xs: 1, sm: 4 },
                        }}
                    >
                        複数人同時プレイ型のゲームを投稿でき、公開されたゲームをみんなで遊べるサイトです。
                    </Typography>
                </Box>
                <Box>
                    <Typography variant="h6" component="h2">
                        使い方
                    </Typography>
                    <List disablePadding>
                        <ListItem
                            disablePadding
                            sx={{ pl: { xs: 0.5, sm: 2 } }}
                        >
                            <ListItemIcon>
                                <SportsEsports />
                            </ListItemIcon>
                            <ListItemText
                                primary={
                                    <Typography variant="body1">
                                        遊ぶ
                                    </Typography>
                                }
                                secondary={
                                    <Typography
                                        variant="body1"
                                        color="textSecondary"
                                    >
                                        部屋を立て、表示されたURLを招待したい人に送ります。部屋を立てたり、参加するのにサインインは不要です。
                                        部屋は公開/限定を選べます。
                                        公開部屋は一覧から誰でも参加でき、限定部屋は一覧に表示されますが入室の言葉が必要です。
                                        招待リンクを知っている人は入室の言葉なしに参加できます。
                                    </Typography>
                                }
                            />
                        </ListItem>
                        <ListItem
                            disablePadding
                            sx={{ pl: { xs: 0.5, sm: 2 } }}
                        >
                            <ListItemIcon>
                                <FileUpload />
                            </ListItemIcon>
                            <ListItemText
                                primary={
                                    <Typography variant="body1">
                                        投稿
                                    </Typography>
                                }
                                secondary={
                                    <Typography
                                        variant="body1"
                                        color="textSecondary"
                                    >
                                        メニューから投稿できます。
                                        投稿にはサインインが必要です。
                                    </Typography>
                                }
                            />
                        </ListItem>
                    </List>
                </Box>
                <Box>
                    <Typography variant="h6" component="h2">
                        便利な使い方
                    </Typography>
                    <List disablePadding>
                        <ListItem
                            disableGutters
                            sx={{ pl: { xs: 0.5, sm: 2 } }}
                        >
                            <ListItemIcon>
                                <Person />
                            </ListItemIcon>
                            <ListItemText
                                primary={
                                    <Typography variant="body1">
                                        名前
                                    </Typography>
                                }
                                secondary={
                                    <Typography
                                        variant="body1"
                                        color="textSecondary"
                                    >
                                        一部ゲームは名前を使って参加できます。
                                        サインインしていると名前の入力を省略できます。
                                    </Typography>
                                }
                            />
                        </ListItem>
                        <ListItem
                            disableGutters
                            sx={{ pl: { xs: 0.5, sm: 2 } }}
                        >
                            <ListItemIcon>
                                <ReadMore />
                            </ListItemIcon>
                            <ListItemText
                                primary={
                                    <Typography variant="body1">
                                        延長
                                    </Typography>
                                }
                                secondary={
                                    <Typography
                                        variant="body1"
                                        color="textSecondary"
                                    >
                                        部屋は30分で自動終了しますが、
                                        残り時間が少なくなったときに参加者の誰かが
                                        延長ボタンを押すと残り時間を伸ばせます。
                                        延長回数に制限はありません。
                                    </Typography>
                                }
                            />
                        </ListItem>
                        <ListItem
                            disableGutters
                            sx={{ pl: { xs: 0.5, sm: 2 } }}
                        >
                            <ListItemIcon>
                                <Delete />
                            </ListItemIcon>
                            <ListItemText
                                primary={
                                    <Typography variant="body1">
                                        終了
                                    </Typography>
                                }
                                secondary={
                                    <Typography
                                        variant="body1"
                                        color="textSecondary"
                                    >
                                        部屋を立てた人はいつでも部屋を閉じることができます。
                                    </Typography>
                                }
                            />
                        </ListItem>
                    </List>
                </Box>
                <Box>
                    <Typography variant="h6" component="h2">
                        投稿できるゲーム
                    </Typography>
                    <Typography
                        variant="body1"
                        sx={{
                            pl: { xs: 1, sm: 4 },
                        }}
                        color="textSecondary"
                    >
                        <Button
                            component={Link}
                            endIcon={<OpenInNew />}
                            href="https://akashic-games.github.io/"
                            target="_blank"
                            rel="noreferrer"
                            sx={{
                                textTransform: "none",
                                color: theme.palette.primary.light,
                            }}
                        >
                            Akashic Engine
                        </Button>{" "}
                        を使って作られたゲームが投稿できます。Akashic Engine は
                        DWANGO が提供する 2D ゲームエンジンで、
                        複数人プレイ向けの仕組みを備えています。
                    </Typography>
                    <Typography
                        variant="body1"
                        sx={{
                            pl: { xs: 1, sm: 4 },
                        }}
                    >
                        投稿できるゲームは下記の通りです。{" "}
                        <code>game.json</code> を確認してください。
                    </Typography>
                    <List
                        dense
                        disablePadding
                        sx={{
                            listStyleType: "disc",
                            pl: { xs: 2, sm: 6 },
                            color: theme.palette.text.secondary,
                            fontSize: theme.typography.body2.fontSize,
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                        }}
                    >
                        <ListItem disableGutters sx={{ display: "list-item" }}>
                            <code>environment.sandbox-runtime</code>: "3"
                        </ListItem>
                        <ListItem disableGutters sx={{ display: "list-item" }}>
                            <code>environment.nicolive.supportedModes</code>:
                            <code>"multi_admission"</code> または{" "}
                            <code>"multi"</code>
                        </ListItem>
                        <ListItem disableGutters sx={{ display: "list-item" }}>
                            <code>environment.external</code>: "coe"、
                            "coeLimited" および "playerBan" に対応。
                            <br />
                            <code>
                                @akashic-extension/instance-storage
                            </code>{" "}
                            は機能しない点に注意してください。
                        </ListItem>
                        <ListItem disableGutters sx={{ display: "list-item" }}>
                            "playerBan"
                            は、部屋主が進行中のゲームから参加者を即時退室(BAN)させるための拡張です。
                            コンテンツに{" "}
                            <code>@multi-indiegame/akashic-player-ban</code>{" "}
                            を組み込むと利用できます。BANの成立は全インスタンスへ同一
                            tick
                            で届くため、ターン順から外すといったゲーム状態の変更に使えます。
                            <br />
                            本サイトでは、ゲームからBANを要求できるのは部屋主だけです。部屋主以外からの要求は
                            "Unauthorized" で、自分自身（部屋主）へのBANは
                            "SelfBan" で拒否されます。
                            <br />
                            BANの要求ごとに部屋主へ確認ダイアログを表示し、部屋主がキャンセルした場合は
                            "UserCancel" を返します。
                            <br />
                            ゲームから行えるのはBANの要求までで、解除はモデレーション設定から行います。チャットからのBANや設定画面での解除もゲームへ通知されるため、
                            <code>onPlayerBanned</code> と{" "}
                            <code>onPlayerUnbanned</code>{" "}
                            の両方を用意してください。
                            <br />
                            <Button
                                component={Link}
                                endIcon={<OpenInNew />}
                                href="https://github.com/multi-indiegame/akashic-player-ban"
                                target="_blank"
                                rel="noreferrer"
                                sx={{
                                    textTransform: "none",
                                    color: theme.palette.primary.light,
                                }}
                            >
                                @multi-indiegame/akashic-player-ban
                            </Button>
                        </ListItem>
                    </List>
                </Box>
            </Stack>
        </Container>
    );
}
