"use client";

import { ChangeEvent, useTransition, useState } from "react";
import { redirect } from "next/navigation";
import JSZip from "jszip";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Container,
    FormControlLabel,
    List,
    ListItem,
    Stack,
    Switch,
    TextField,
    Typography,
    useTheme,
} from "@mui/material";
import {
    AddCircle,
    EditNote,
    FileUpload,
    Image as ImageIcon,
} from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import {
    ContentErrorResponse,
    GAME_FILE_MAX_MB,
    messageKey,
    messages,
    supportedAkashicModes,
    supportedAkashicVersions,
    supportedExternalPlugins,
} from "@/lib/types";
import { registerContent } from "@/lib/server/content-register";
import { editContent } from "@/lib/server/content-edit";
import { useAuth } from "@/lib/client/useAuth";
import { SignInAlert } from "./sign-in-alert";
import { GameTermsAndConditions } from "./game-tac";
import { GameDeleteDialog } from "./game-delete-dialog";

const VisuallyHiddenInput = styled("input")();

type GameFormProps = Partial<{
    gameId: number;
    contentId: number;
    title: string;
    iconUrl: string;
    description: string;
    credit: string;
    streaming: boolean;
}>;

export function GameForm({
    gameId,
    contentId,
    title: initialTitle,
    iconUrl,
    description: initialDescription,
    credit: initialCredit,
    streaming: initialStreaming,
}: GameFormProps) {
    const [user] = useAuth();
    const theme = useTheme();
    const [title, setTitle] = useState(initialTitle ?? "");
    const [gameFile, setGameFile] = useState<File>();
    const [iconFile, setIconFile] = useState<File>();
    const [iconPreview, setIconPreview] = useState<string | undefined>(iconUrl);
    const [description, setDescription] = useState(initialDescription ?? "");
    const [credit, setCredit] = useState(initialCredit ?? "");
    const [streaming, setStreaming] = useState(initialStreaming ?? true);
    const [license, setLicense] = useState<string>();
    const [isPending, startTransition] = useTransition();
    const [titleError, setTitleError] = useState<string>();
    const [gameFileError, setGameFileError] = useState<string>();
    const [iconFileError, setIconFileError] = useState<string>();
    const [descriptionError, setDescriptionError] = useState<string>();
    const [serverError, setServerError] = useState<string>();
    const [unsupportedExternals, setUnsupportedExternals] =
        useState<string[]>();

    function handleInputTitle(event: ChangeEvent<HTMLInputElement>) {
        if (event.target.value) {
            setTitleError(undefined);
        }
        setTitle(event.target.value);
    }

    async function handleUploadGameFile(event: ChangeEvent<HTMLInputElement>) {
        if (event.target.files && event.target.files[0]) {
            setGameFileError(undefined);
            setUnsupportedExternals(undefined);
            const file = event.target.files[0];
            // 上限超過のまま送信すると Next.js 側でボディが切り詰められ、
            // 原因の分からない失敗になるため選択時点で弾く
            if (file.size > GAME_FILE_MAX_MB * 1024 * 1024) {
                setGameFile(undefined);
                setLicense(undefined);
                setGameFileError(
                    `ゲームデータファイルは ${GAME_FILE_MAX_MB}MB 以下にしてください。`,
                );
                event.target.value = "";
                return;
            }
            setGameFile(file);
            try {
                const zip = await JSZip.loadAsync(await file.arrayBuffer());
                const gameJsonFile = zip.file("game.json");
                if (gameJsonFile) {
                    try {
                        const gameJson = JSON.parse(
                            await gameJsonFile.async("text"),
                        );
                        const externalKeys = Object.keys(
                            gameJson?.environment?.external ?? {},
                        ).sort();
                        const unsupportedExternalKeys = externalKeys.filter(
                            (key) => !supportedExternalPlugins.includes(key),
                        );
                        if (unsupportedExternalKeys.length > 0) {
                            setUnsupportedExternals(unsupportedExternalKeys);
                        }
                    } catch (err) {
                        console.warn("failed to parse game.json", err);
                    }
                }
                const licenseFile = zip.file("library_license.txt");
                if (licenseFile) {
                    const text = await licenseFile.async("text");
                    setLicense(text);
                } else {
                    setLicense(undefined);
                }
            } catch (err) {
                console.warn("failed to read library_license.txt", err);
                setLicense(undefined);
            }
        }
    }

    function handleUploadIconFile(event: ChangeEvent<HTMLInputElement>) {
        if (event.target.files && event.target.files[0]) {
            setIconFileError(undefined);
            setIconFile(event.target.files[0]);
            setIconPreview(URL.createObjectURL(event.target.files[0]));
        }
    }

    function handleInputDescription(event: ChangeEvent<HTMLInputElement>) {
        if (event.target.value) {
            setDescriptionError(undefined);
        }
        setDescription(event.target.value);
    }

    function handleInputCredit(event: ChangeEvent<HTMLInputElement>) {
        setCredit(event.target.value);
    }

    function handleServerErr(res: ContentErrorResponse) {
        switch (res.reason) {
            case "InvalidParams":
                setServerError(
                    "内部エラーが発生しました。入力内容を確認してもう一度投稿してください。",
                );
                break;
            case "NoGameJson":
                setServerError(
                    "不正なゲームデータファイルです。game.json が含まれていません。",
                );
                break;
            case "InvalidGameJson":
                setServerError(
                    "不正なゲームデータファイルです。game.json がJSON形式ではありません",
                );
                break;
            case "UnsupportedVersion":
                setServerError(
                    "非サポートのバージョンが指定されています。" +
                        "game.json の environment.sandbox-runtime の値を確認してください。" +
                        `(サポート: ${supportedAkashicVersions.map((v) => `"${v}"`).join()})`,
                );
                break;
            case "UnsupportedMode":
                setServerError(
                    "非サポートのモードが指定されています。" +
                        "game.json の environment.nicolive.supportedModes の値を確認してください。" +
                        `(サポート: ${supportedAkashicModes.map((m) => `"${m}"`).join()})`,
                );
                break;
            case "Drain":
                setServerError(
                    "現在臨時メンテナンス中のため、コンテンツの投稿・更新ができません。1時間ほど時間をおいてください。",
                );
                break;
            case "InternalError":
            default:
                setServerError(
                    "予期しないエラーが発生しました。時間をおいてリトライしてください。",
                );
                break;
        }
    }

    function handleSubmit() {
        if (gameId == null || contentId == null) {
            if (!title) {
                setTitleError("ゲームタイトルを入力してください。");
            }
            if (!gameFile) {
                setGameFileError("ゲームファイルをアップロードしてください。");
            }
            if (!iconFile) {
                setIconFileError("ゲームアイコンをアップロードしてください。");
            }
            if (!description) {
                setDescriptionError("ゲーム説明を入力してください。");
            }
        }
        if (!user) {
            setServerError("サインインしてください。");
        }
        if (user) {
            startTransition(async () => {
                if (gameId == null || contentId == null) {
                    if (title && gameFile && iconFile && description) {
                        const res = await registerContent({
                            publisherId: user.id,
                            title,
                            gameFile,
                            iconFile,
                            description,
                            credit,
                            streaming,
                        });
                        if (res.ok) {
                            redirect(
                                `/?${messageKey}=${messages.content.registerSuccessful}`,
                            );
                        } else {
                            handleServerErr(res);
                        }
                    }
                } else {
                    const res = await editContent({
                        gameId,
                        contentId,
                        publisherId: user.id,
                        title,
                        gameFile,
                        iconFile,
                        description,
                        credit,
                        streaming,
                    });
                    if (res.ok) {
                        redirect(
                            `/?${messageKey}=${messages.content.editSuccessful}`,
                        );
                    } else {
                        handleServerErr(res);
                    }
                }
            });
        }
    }

    if (!user || user.authType === "guest") {
        const message = `ゲームを${gameId == null ? "投稿" : "更新"}するにはサインインが必要です。`;
        return <SignInAlert message={message} />;
    }

    return (
        <Container
            maxWidth="lg"
            sx={{
                mt: 4,
                display: "flex",
                flexFlow: "column",
                alignItems: "center",
                gap: 4,
            }}
        >
            <Stack
                direction="row"
                spacing={2}
                sx={{
                    width: "100%",
                    alignItems: "center",
                }}
            >
                <Box sx={{ flex: 1 }} />
                {gameId == null ? (
                    <AddCircle fontSize="large" />
                ) : (
                    <EditNote fontSize="large" />
                )}
                <Typography variant="h4" component="h1">
                    ゲームを{gameId == null ? "投稿" : "更新"}する
                </Typography>
                <Box sx={{ flex: 1 }} />
            </Stack>
            <Card sx={{ width: "100%" }}>
                <CardContent sx={{ p: 2 }}>
                    <Box component="form" action={handleSubmit}>
                        <Stack spacing={3}>
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    ゲームタイトル{" "}
                                    <Typography component="span" color="error">
                                        *
                                    </Typography>
                                </Typography>
                                {titleError && (
                                    <Alert
                                        variant="outlined"
                                        severity="error"
                                        sx={{ mb: 1 }}
                                    >
                                        {titleError}
                                    </Alert>
                                )}
                                <TextField
                                    fullWidth
                                    placeholder="例: みんなと遊ぶゲーム"
                                    value={title}
                                    onChange={handleInputTitle}
                                />
                            </Box>
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    ゲームデータファイル (zip形式・
                                    {GAME_FILE_MAX_MB}MBまで){" "}
                                    <Typography component="span" color="error">
                                        *
                                    </Typography>
                                </Typography>
                                {gameFileError && (
                                    <Alert
                                        variant="outlined"
                                        severity="error"
                                        sx={{ mb: 1 }}
                                    >
                                        {gameFileError}
                                    </Alert>
                                )}
                                {unsupportedExternals && (
                                    <Alert
                                        variant="outlined"
                                        severity="warning"
                                        sx={{ mb: 1 }}
                                    >
                                        <Typography variant="body2">
                                            以下のプラグインは動作しないのでご注意ください
                                        </Typography>
                                        <List
                                            dense
                                            sx={{
                                                listStyleType: "disc",
                                                pl: 2,
                                            }}
                                        >
                                            {unsupportedExternals.map(
                                                (external) => (
                                                    <ListItem
                                                        sx={{
                                                            fontSize:
                                                                theme.typography
                                                                    .body2
                                                                    .fontSize,
                                                            display:
                                                                "list-item",
                                                            fontFamily:
                                                                "monospace",
                                                        }}
                                                    >
                                                        "{external}"
                                                    </ListItem>
                                                ),
                                            )}
                                        </List>
                                    </Alert>
                                )}
                                <Box
                                    component="label"
                                    sx={{
                                        width: "100%",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        color: theme.palette.text.secondary,
                                        border: "2px dashed",
                                        borderColor: gameFile
                                            ? theme.palette.divider
                                            : theme.palette.primary.main,
                                        borderRadius: 2,
                                        p: 3,
                                        transition: "all 0.2s",
                                        cursor: "point",
                                        "&:hover": {
                                            bgcolor: theme.palette.primary.main,
                                        },
                                    }}
                                >
                                    <VisuallyHiddenInput
                                        type="file"
                                        accept=".zip"
                                        sx={{ display: "none" }}
                                        onChange={handleUploadGameFile}
                                    />
                                    <FileUpload fontSize="large" />
                                    <Typography
                                        variant="body1"
                                        sx={{ textTransform: "none" }}
                                    >
                                        {gameFile
                                            ? gameFile.name
                                            : "クリックしてZIPファイルを選択 または ファイルをドロップ"}
                                    </Typography>
                                </Box>
                            </Box>
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    ゲームアイコン{" "}
                                    <Typography component="span" color="error">
                                        *
                                    </Typography>
                                </Typography>
                                {iconFileError && (
                                    <Alert
                                        variant="outlined"
                                        severity="error"
                                        sx={{ mb: 1 }}
                                    >
                                        {iconFileError}
                                    </Alert>
                                )}
                                <Stack
                                    direction="row"
                                    spacing={2}
                                    sx={{
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                    }}
                                >
                                    <Avatar
                                        variant="square"
                                        src={iconPreview}
                                        sx={{
                                            width: 120,
                                            height: 120,
                                            border: iconPreview
                                                ? ""
                                                : "2px solid",
                                            bgcolor: "transparent",
                                            borderColor: theme.palette.divider,
                                        }}
                                    >
                                        <ImageIcon
                                            fontSize="large"
                                            color="disabled"
                                        />
                                    </Avatar>
                                    <Box sx={{ width: "100%" }}>
                                        <Box
                                            component="label"
                                            sx={{
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                color: theme.palette.text
                                                    .secondary,
                                                border: "2px dashed",
                                                borderColor: iconFile
                                                    ? theme.palette.divider
                                                    : theme.palette.primary
                                                          .main,
                                                borderRadius: 2,
                                                p: 3,
                                                textAlign: "center",
                                                transition: "all 0.2s",
                                                cursor: "point",
                                                "&:hover": {
                                                    bgcolor:
                                                        theme.palette.primary
                                                            .main,
                                                },
                                            }}
                                        >
                                            <VisuallyHiddenInput
                                                type="file"
                                                accept="image/*"
                                                sx={{ display: "none" }}
                                                onChange={handleUploadIconFile}
                                            />
                                            <FileUpload fontSize="large" />
                                            <Typography
                                                variant="body1"
                                                sx={{ textTransform: "none" }}
                                            >
                                                {iconFile
                                                    ? iconFile.name
                                                    : "クリックして画像を選択 または ファイルをドロップ"}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Stack>
                            </Box>
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    ゲーム説明{" "}
                                    <Typography component="span" color="error">
                                        *
                                    </Typography>
                                </Typography>
                                {descriptionError && (
                                    <Alert
                                        variant="outlined"
                                        severity="error"
                                        sx={{ mb: 1 }}
                                    >
                                        {descriptionError}
                                    </Alert>
                                )}
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={6}
                                    placeholder="ゲームの内容、遊び方などの説明を記入してください"
                                    value={description}
                                    onChange={handleInputDescription}
                                />
                            </Box>
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    クレジット
                                </Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={5}
                                    placeholder="使用素材・ライブラリ・協力者などのクレジットを記入してください"
                                    value={credit}
                                    onChange={handleInputCredit}
                                />
                            </Box>
                            {license && (
                                <Box>
                                    <Typography variant="h6" gutterBottom>
                                        ライブラリライセンス
                                        (library_license.txt)
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={6}
                                        value={license}
                                        slotProps={{
                                            input: {
                                                readOnly: true,
                                            },
                                        }}
                                        sx={{
                                            "& .MuiInputBase-input": {
                                                color: theme.palette.text
                                                    .secondary,
                                                fontSize:
                                                    theme.typography.body2
                                                        .fontSize,
                                                fontFamily: "monospace",
                                            },
                                        }}
                                    />
                                </Box>
                            )}
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    実況可否
                                </Typography>
                                <Stack
                                    spacing={1}
                                    direction="row"
                                    sx={{
                                        alignItems: "center",
                                    }}
                                >
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={streaming}
                                                onChange={(event) =>
                                                    setStreaming(
                                                        event.target.checked,
                                                    )
                                                }
                                            />
                                        }
                                        label="このゲームの実況動画・配信を許可する"
                                    />
                                    {!streaming && (
                                        <Typography
                                            variant="body2"
                                            color="error"
                                        >
                                            プレイされるとき、実況不可として表示します。
                                        </Typography>
                                    )}
                                </Stack>
                            </Box>
                            <GameTermsAndConditions />
                            {serverError && (
                                <Alert variant="outlined" severity="error">
                                    {serverError}
                                </Alert>
                            )}
                            <Box>
                                <Button
                                    type="submit"
                                    variant="contained"
                                    size="large"
                                    fullWidth
                                    color={
                                        gameId == null &&
                                        (!title ||
                                            !gameFile ||
                                            !iconFile ||
                                            !description)
                                            ? "inherit"
                                            : "primary"
                                    }
                                    loading={isPending}
                                    disabled={isPending}
                                >
                                    ゲームを{gameId == null ? "投稿" : "更新"}
                                </Button>
                            </Box>
                            {gameId != null && (
                                <Box
                                    sx={{
                                        display: "flex",
                                        justifyContent: "center",
                                    }}
                                >
                                    <GameDeleteDialog
                                        gameId={gameId}
                                        publisherId={user.id}
                                    />
                                </Box>
                            )}
                        </Stack>
                    </Box>
                </CardContent>
            </Card>
        </Container>
    );
}
