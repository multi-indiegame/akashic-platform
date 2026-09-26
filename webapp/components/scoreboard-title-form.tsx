"use client";

import { useState, useTransition } from "react";
import {
    Alert,
    Avatar,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
    useTheme,
} from "@mui/material";
import { ImageNotSupported } from "@mui/icons-material";
import type { ScoreTitleRank } from "@multi-indiegame/persist-schema";
import {
    TITLE_RANKS,
    TITLE_RANK_COLOR,
    titleRankLabel,
} from "@/lib/title-rank";
import { TitleFieldNames, describeConditions } from "@/lib/title-condition";
import {
    TitleDefRow,
    TitleEditorData,
    removeTitleImage,
    replaceTitleImage,
    retireTitleDef,
    saveTitleDef,
} from "@/lib/server/scoreboard-title-action";
import { useTitleRankImageUrl } from "@/lib/client/useTitleRankImageUrl";

/** 条件 1 件分の入力。画面では 1 行として扱う */
interface ConditionRow {
    /** 記録のキーを見るか、遊んだ回数を見るか */
    target: "field" | "playCount";
    field: string;
    of: "best" | "latest" | "sum" | "count";
    op: ">=" | ">" | "<=" | "<" | "==";
    /** 真偽値のキーでは「達成した」を意味する */
    valueKind: "number" | "true";
    value: number;
}

const CONDITION_TEXT_MAX_LENGTH = 100;

const emptyRow = (field: string): ConditionRow => ({
    target: "field",
    field,
    of: "best",
    op: ">=",
    valueKind: "number",
    value: 1,
});

export function ScoreboardTitleForm({
    gameId,
    data,
}: {
    gameId: number;
    data: TitleEditorData;
}) {
    const theme = useTheme();
    const toRankImageURL = useTitleRankImageUrl();
    const [editing, setEditing] = useState<TitleDefRow | "new">();
    const [retiring, setRetiring] = useState<TitleDefRow>();
    const [message, setMessage] = useState<{
        severity: "success" | "error";
        text: string;
    }>();

    async function handleRetire() {
        if (!retiring) {
            return;
        }
        const target = retiring;
        setRetiring(undefined);
        const res = await retireTitleDef(gameId, target.id);
        setMessage(
            res.ok
                ? {
                      severity: "success",
                      text:
                          target.awardedCount > 0
                              ? "配布を停止しました。すでに獲得した人の称号は残ります。"
                              : "称号を削除しました。",
                  }
                : { severity: "error", text: "変更に失敗しました。" },
        );
        if (res.ok) {
            location.reload();
        }
    }

    return (
        <Stack spacing={2}>
            <Alert variant="outlined" severity="info">
                称号は、条件を満たした人へ自動で付与されます。同じ分類の中では、いちばん上の段位だけが残ります。
            </Alert>
            {data.defs.length === 0 && (
                <Alert variant="outlined" severity="info">
                    まだ称号がありません。「称号を追加する」から作れます。
                </Alert>
            )}
            {data.defs.map((def) => (
                <Card key={def.id} variant="outlined">
                    <CardContent>
                        <Stack spacing={1}>
                            <Stack
                                direction="row"
                                spacing={1}
                                sx={{ alignItems: "center", flexWrap: "wrap" }}
                            >
                                <Typography
                                    variant="caption"
                                    color="textSecondary"
                                >
                                    表示順 {def.priority}
                                </Typography>
                                <Stack spacing={0}>
                                    <Avatar
                                        src={def.imageURL}
                                        alt={titleRankLabel(def.rank)}
                                        variant="rounded"
                                        sx={{ width: 100, height: 100 }}
                                        slotProps={{
                                            img: {
                                                style: {
                                                    objectFit: "contain",
                                                    width: "100%",
                                                    height: "100%",
                                                },
                                            },
                                        }}
                                    >
                                        <ImageNotSupported fontSize="large" />
                                    </Avatar>
                                    {def.rank !== "NONE" && (
                                        <Avatar
                                            src={toRankImageURL(def.rank)}
                                            alt={def.rank}
                                            variant="square"
                                            sx={{ width: 100 }}
                                            slotProps={{
                                                img: {
                                                    style: {
                                                        objectFit: "contain",
                                                        width: "100%",
                                                        height: "100%",
                                                    },
                                                },
                                            }}
                                        >
                                            <Chip
                                                size="small"
                                                label={titleRankLabel(def.rank)}
                                                sx={{
                                                    color: TITLE_RANK_COLOR[
                                                        def.rank
                                                    ],
                                                    borderColor:
                                                        TITLE_RANK_COLOR[
                                                            def.rank
                                                        ],
                                                }}
                                            />
                                        </Avatar>
                                    )}
                                </Stack>
                                <Typography variant="subtitle1" component="h2">
                                    {def.name}
                                </Typography>
                                {def.retired && (
                                    <Chip
                                        size="small"
                                        color="error"
                                        variant="outlined"
                                        label="配布を停止中"
                                    />
                                )}
                                <Typography
                                    variant="caption"
                                    color="textSecondary"
                                >
                                    分類 {def.categoryKey}・獲得{" "}
                                    {def.awardedCount} 人
                                </Typography>
                            </Stack>
                            <Typography
                                variant="body2"
                                color="textSecondary"
                                sx={{ whiteSpace: "pre-wrap" }}
                            >
                                {def.conditionText ??
                                    describe(def, data.fields)}
                            </Typography>
                            {def.conditionHidden && (
                                <Chip
                                    size="small"
                                    variant="outlined"
                                    label="獲得条件非公開"
                                    color="info"
                                    sx={{ alignSelf: "flex-start" }}
                                />
                            )}
                            <Stack direction="row" spacing={1}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => setEditing(def)}
                                    sx={{
                                        borderColor:
                                            theme.palette.primary.light,
                                        color: theme.palette.primary.light,
                                    }}
                                >
                                    編集
                                </Button>
                                <Button
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    disabled={def.retired}
                                    onClick={(e) => {
                                        e.currentTarget.blur();
                                        setRetiring(def);
                                    }}
                                >
                                    {def.awardedCount > 0
                                        ? "配布停止"
                                        : "削除する"}
                                </Button>
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
            ))}
            {message && (
                <Alert variant="outlined" severity={message.severity}>
                    {message.text}
                </Alert>
            )}
            <Paper
                elevation={3}
                sx={{
                    position: "sticky",
                    bottom: 0,
                    zIndex: 1,
                    p: 1.5,
                    display: "flex",
                    justifyContent: "center",
                }}
            >
                <Button variant="contained" onClick={() => setEditing("new")}>
                    称号を追加する
                </Button>
            </Paper>
            {editing && (
                <TitleDialog
                    gameId={gameId}
                    keys={data.keys}
                    fields={data.fields}
                    def={editing === "new" ? undefined : editing}
                    onClose={() => setEditing(undefined)}
                />
            )}
            <Dialog open={!!retiring} onClose={() => setRetiring(undefined)}>
                <DialogTitle>
                    {retiring && retiring.awardedCount > 0
                        ? "この称号の配布を停止しますか"
                        : "この称号を削除しますか"}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {retiring && retiring.awardedCount > 0 ? (
                            <>
                                これから条件を満たした人には付与されなくなります。
                                <strong>
                                    すでに獲得した {retiring.awardedCount}{" "}
                                    人の称号は残ります。
                                </strong>
                            </>
                        ) : (
                            "まだ誰も獲得していないため、この称号は削除されます。"
                        )}
                    </DialogContentText>
                    <DialogActions>
                        <Button
                            variant="outlined"
                            color="inherit"
                            onClick={() => setRetiring(undefined)}
                        >
                            キャンセル
                        </Button>
                        <Button
                            variant="contained"
                            color="error"
                            onClick={handleRetire}
                        >
                            {retiring && retiring.awardedCount > 0
                                ? "配布停止"
                                : "削除する"}
                        </Button>
                    </DialogActions>
                </DialogContent>
            </Dialog>
        </Stack>
    );
}

function TitleDialog({
    gameId,
    keys,
    fields,
    def,
    onClose,
}: {
    gameId: number;
    keys: string[];
    fields: TitleFieldNames;
    def?: TitleDefRow;
    onClose: () => void;
}) {
    const theme = useTheme();
    const toRankImageURL = useTitleRankImageUrl();
    const [name, setName] = useState(def?.name ?? "");
    const [categoryKey, setCategoryKey] = useState(def?.categoryKey ?? "");
    const [rank, setRank] = useState<ScoreTitleRank>(def?.rank ?? "NONE");
    const [priority, setPriority] = useState(def?.priority ?? 0);
    const [rows, setRows] = useState<ConditionRow[]>(
        def ? toRows(def) : [emptyRow(keys[0] ?? "")],
    );
    const [image, setImage] = useState<File>();
    const [imageCredit, setImageCredit] = useState(def?.imageCredit ?? "");
    const [customConditionText, setCustomConditionText] = useState(
        !!def?.conditionText,
    );
    const [conditionText, setConditionText] = useState(
        def?.conditionText ?? "",
    );
    const [conditionHidden, setConditionHidden] = useState(
        def?.conditionHidden ?? false,
    );
    const autoConditionText = describeConditions(
        rows.map(toCondition),
        fields,
    ).join("\n");
    const [removingImage, startRemoveImageTransition] = useTransition();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string>();

    function update(index: number, patch: Partial<ConditionRow>) {
        setRows((current) =>
            current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
        );
    }

    function handleCustomConditionText(checked: boolean) {
        setCustomConditionText(checked);
        if (checked && !conditionText.trim()) {
            setConditionText(
                autoConditionText.slice(0, CONDITION_TEXT_MAX_LENGTH),
            );
        }
    }

    async function handleSave() {
        if (customConditionText && !conditionText.trim()) {
            setError("獲得条件の説明を入力してください。");
            return;
        }
        setSaving(true);
        setError(undefined);
        const res = await saveTitleDef(gameId, {
            id: def?.id,
            name,
            categoryKey,
            rank,
            priority,
            imageCredit,
            condition: { all: rows.map(toCondition) },
            conditionText: customConditionText ? conditionText : "",
            conditionHidden,
        });
        if (res.ok && image && def?.id) {
            // WHY: 画像は id が決まってからでないと置き場所が決まらない
            const form = new FormData();
            form.append("image", image);
            const uploaded = await replaceTitleImage(gameId, def.id, form);
            if (!uploaded.ok) {
                setSaving(false);
                setError(
                    "称号は保存しましたが、画像を登録できませんでした。1MB 以下の画像を選んでください。",
                );
                return;
            }
        }
        setSaving(false);
        if (res.ok) {
            location.reload();
            return;
        }
        setError(
            res.reason === "InvalidParams"
                ? "入力に誤りがあります。名前と分類、条件を確かめてください。"
                : "保存できませんでした。",
        );
    }

    function handleRemoveTitleImage() {
        startRemoveImageTransition(async () => {
            if (def?.imageURL) {
                const res = await removeTitleImage(gameId, def.id);
                if (res.ok) {
                    def.imageURL = undefined;
                }
            }
        });
    }

    function handleClose(ev: {}, reason: "escapeKeyDown" | "backdropClick") {
        if (saving || reason === "backdropClick") {
            return;
        }
        onClose();
    }

    return (
        <Dialog open fullWidth maxWidth="lg" onClose={handleClose}>
            <DialogTitle>{def ? "称号を編集" : "称号を追加"}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                        label="称号の名前"
                        size="small"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        slotProps={{ htmlInput: { maxLength: 20 } }}
                    />
                    <TextField
                        label="分類"
                        size="small"
                        value={categoryKey}
                        onChange={(e) => setCategoryKey(e.target.value)}
                        helperText="同じ分類の中では、いちばん上の段位だけが残ります。半角英数字と _ - :"
                        slotProps={{ htmlInput: { maxLength: 32 } }}
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField
                            select
                            label="段位"
                            size="small"
                            fullWidth
                            value={rank}
                            onChange={(e) =>
                                setRank(e.target.value as ScoreTitleRank)
                            }
                        >
                            {TITLE_RANKS.map((r) => (
                                <MenuItem key={r.value} value={r.value}>
                                    {r.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            label="表示順"
                            size="small"
                            type="number"
                            fullWidth
                            value={priority}
                            onChange={(e) =>
                                setPriority(Number(e.target.value))
                            }
                            helperText="小さいほど先に出ます"
                        />
                    </Stack>
                    <Typography variant="subtitle2">画像</Typography>
                    <Stack
                        direction="row"
                        spacing={2}
                        sx={{ alignItems: "center", flexWrap: "wrap" }}
                    >
                        <Avatar
                            src={
                                image
                                    ? URL.createObjectURL(image)
                                    : def?.imageURL
                            }
                            alt=""
                            variant="rounded"
                            sx={{ width: 56, height: 56 }}
                        />
                        <Avatar
                            src={toRankImageURL(def?.rank)}
                            alt=""
                            variant="rounded"
                            sx={{ width: 56, height: 56 }}
                        />
                        <Button
                            size="small"
                            variant="outlined"
                            component="label"
                            sx={{
                                color: theme.palette.primary.light,
                                borderColor: theme.palette.primary.light,
                            }}
                        >
                            画像を選ぶ
                            <input
                                hidden
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                    setImage(e.target.files?.[0] ?? undefined)
                                }
                            />
                        </Button>
                        {image ? (
                            <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                onClick={() => setImage(undefined)}
                            >
                                アップロードを取り消す
                            </Button>
                        ) : (
                            def?.imageURL && (
                                <Button
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    loading={removingImage}
                                    disabled={removingImage}
                                    onClick={handleRemoveTitleImage}
                                >
                                    画像を削除する
                                </Button>
                            )
                        )}
                    </Stack>
                    <TextField
                        label="画像のクレジット"
                        size="small"
                        value={imageCredit}
                        onChange={(e) => setImageCredit(e.target.value)}
                        helperText="表示が求められる素材を使ったときに書いてください。ゲーム詳細のクレジットに並びます。"
                        slotProps={{ htmlInput: { maxLength: 200 } }}
                    />
                    {!def && (
                        <Typography variant="caption" color="textSecondary">
                            画像はいちど保存してから登録できます。
                        </Typography>
                    )}
                    <Typography variant="caption" color="textSecondary">
                        1MB 以下。
                    </Typography>
                    <Typography variant="subtitle2">付与の条件</Typography>
                    {rows.map((row, index) => (
                        <Stack
                            key={index}
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            sx={{ alignItems: { sm: "center" } }}
                        >
                            <TextField
                                select
                                label="対象"
                                size="small"
                                value={row.target}
                                sx={{ minWidth: 140 }}
                                onChange={(e) =>
                                    update(index, {
                                        target: e.target
                                            .value as ConditionRow["target"],
                                    })
                                }
                            >
                                <MenuItem value="field">記録のキー</MenuItem>
                                <MenuItem value="playCount">
                                    遊んだ回数
                                </MenuItem>
                            </TextField>
                            {row.target === "field" && (
                                <>
                                    <TextField
                                        select
                                        label="キー"
                                        size="small"
                                        value={row.field}
                                        sx={{ minWidth: 180 }}
                                        onChange={(e) =>
                                            update(index, {
                                                field: e.target.value,
                                            })
                                        }
                                    >
                                        {keys.map((key) => (
                                            <MenuItem key={key} value={key}>
                                                {key}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField
                                        select
                                        label="見る値"
                                        size="small"
                                        value={row.valueKind}
                                        sx={{ minWidth: 150 }}
                                        onChange={(e) =>
                                            update(index, {
                                                valueKind: e.target
                                                    .value as ConditionRow["valueKind"],
                                            })
                                        }
                                    >
                                        <MenuItem value="number">
                                            数として比べる
                                        </MenuItem>
                                        <MenuItem value="true">
                                            達成していれば付与する
                                        </MenuItem>
                                    </TextField>
                                </>
                            )}
                            {row.valueKind === "number" && (
                                <>
                                    {row.target === "field" && (
                                        <TextField
                                            select
                                            label="集計"
                                            size="small"
                                            value={row.of}
                                            sx={{ minWidth: 130 }}
                                            onChange={(e) =>
                                                update(index, {
                                                    of: e.target
                                                        .value as ConditionRow["of"],
                                                })
                                            }
                                        >
                                            <MenuItem value="best">
                                                最良値
                                            </MenuItem>
                                            <MenuItem value="latest">
                                                最新の値
                                            </MenuItem>
                                            <MenuItem value="sum">
                                                合計
                                            </MenuItem>
                                            <MenuItem value="count">
                                                回数
                                            </MenuItem>
                                        </TextField>
                                    )}
                                    <TextField
                                        select
                                        label="条件"
                                        size="small"
                                        value={row.op}
                                        sx={{ minWidth: 110 }}
                                        onChange={(e) =>
                                            update(index, {
                                                op: e.target
                                                    .value as ConditionRow["op"],
                                            })
                                        }
                                    >
                                        <MenuItem value=">=">以上</MenuItem>
                                        <MenuItem value=">">
                                            より大きい
                                        </MenuItem>
                                        <MenuItem value="<=">以下</MenuItem>
                                        <MenuItem value="<">
                                            より小さい
                                        </MenuItem>
                                        <MenuItem value="==">ちょうど</MenuItem>
                                    </TextField>
                                    <TextField
                                        label="値"
                                        size="small"
                                        type="number"
                                        value={row.value}
                                        sx={{ minWidth: 110 }}
                                        onChange={(e) =>
                                            update(index, {
                                                value: Number(e.target.value),
                                            })
                                        }
                                    />
                                </>
                            )}
                            {rows.length > 1 && (
                                <Button
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    onClick={() =>
                                        setRows((current) =>
                                            current.filter(
                                                (_, i) => i !== index,
                                            ),
                                        )
                                    }
                                >
                                    削除
                                </Button>
                            )}
                        </Stack>
                    ))}
                    <Button
                        size="small"
                        variant="outlined"
                        sx={{
                            alignSelf: "flex-start",
                            borderColor: theme.palette.primary.light,
                            color: theme.palette.primary.light,
                        }}
                        onClick={() =>
                            setRows((current) => [
                                ...current,
                                emptyRow(keys[0] ?? ""),
                            ])
                        }
                    >
                        条件を追加
                    </Button>
                    <Typography variant="caption" color="textSecondary">
                        条件をすべて満たしたときに付きます。
                    </Typography>
                    <Typography variant="subtitle2">
                        獲得条件の見せ方
                    </Typography>
                    <Stack>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={conditionHidden}
                                    onChange={(e) =>
                                        setConditionHidden(e.target.checked)
                                    }
                                />
                            }
                            label="獲得条件を公開しない"
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={customConditionText}
                                    disabled={conditionHidden}
                                    onChange={(e) =>
                                        handleCustomConditionText(
                                            e.target.checked,
                                        )
                                    }
                                />
                            }
                            label="説明をカスタマイズする"
                        />
                    </Stack>
                    <TextField
                        label="獲得条件の説明"
                        size="small"
                        multiline
                        minRows={2}
                        disabled={conditionHidden || !customConditionText}
                        value={
                            customConditionText
                                ? conditionText
                                : autoConditionText
                        }
                        onChange={(e) => setConditionText(e.target.value)}
                        helperText={
                            conditionHidden
                                ? "称号の詳細では、獲得条件を「非公開」と表示します。"
                                : customConditionText
                                  ? "称号の詳細に、この説明を獲得条件として表示します。"
                                  : "付与の条件から自動的に作成された説明です。称号の詳細に表示されます。"
                        }
                        slotProps={{
                            htmlInput: { maxLength: CONDITION_TEXT_MAX_LENGTH },
                        }}
                    />
                    {error && (
                        <Alert variant="outlined" severity="error">
                            {error}
                        </Alert>
                    )}
                </Stack>
                <DialogActions>
                    <Button
                        variant="outlined"
                        color="inherit"
                        onClick={onClose}
                    >
                        キャンセル
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        保存する
                    </Button>
                </DialogActions>
            </DialogContent>
        </Dialog>
    );
}

function toCondition(row: ConditionRow) {
    if (row.target === "playCount") {
        return { stat: "playCount" as const, op: row.op, value: row.value };
    }
    if (row.valueKind === "true") {
        return { field: row.field, op: "==" as const, value: true };
    }
    return { field: row.field, of: row.of, op: row.op, value: row.value };
}

function toRows(def: TitleDefRow): ConditionRow[] {
    const rows = def.condition.all.map((condition): ConditionRow => {
        if ("stat" in condition) {
            return {
                target: "playCount",
                field: "",
                of: "best",
                op: condition.op,
                valueKind: "number",
                value: condition.value,
            };
        }
        return {
            target: "field",
            field: condition.field,
            of: condition.of ?? "best",
            op: condition.op,
            valueKind: typeof condition.value === "boolean" ? "true" : "number",
            value: typeof condition.value === "number" ? condition.value : 1,
        };
    });
    return rows.length > 0 ? rows : [emptyRow("")];
}

function describe(def: TitleDefRow, fields: TitleFieldNames): string {
    if (def.condition.all.length === 0) {
        return "条件が設定されていません。";
    }
    return describeConditions(def.condition.all, fields).join(" / ");
}
