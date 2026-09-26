"use client";

import { useState } from "react";
import {
    Alert,
    Button,
    Card,
    CardContent,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Paper,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import type {
    ScoreFieldSetting,
    ScoreValueType,
} from "@multi-indiegame/scoreboard-schema";
import { RECORD_KEY_PATTERN } from "@/lib/types";
import { affectsTopEntries } from "@/lib/scoreboard-rebuild";
import {
    describeTypeCounts,
    presentTypes,
    typeLabel,
} from "@/lib/score-value-type";
import {
    FieldCandidate,
    FormatEditorData,
    saveScoreboardFormat,
} from "@/lib/server/scoreboard-format-action";

export function ScoreboardFormatForm({
    gameId,
    data,
}: {
    gameId: number;
    data: FormatEditorData;
}) {
    const [fields, setFields] = useState(() =>
        Object.fromEntries(
            data.candidates.map((c) => [c.key, { ...c.setting }]),
        ),
    );
    // WHY: 積み直すかは保存済みの設定との差で決まる。保存後は画面を読み直さない
    // ので、保存に成功した時点の設定を比較元として持ち直す
    const [savedFields, setSavedFields] = useState<{
        [key: string]: ScoreFieldSetting;
    }>(() =>
        Object.fromEntries(data.candidates.map((c) => [c.key, c.setting])),
    );
    const [playFields, setPlayFields] = useState(() =>
        Object.fromEntries(
            data.playCandidates.map((c) => [c.key, { ...c.setting }]),
        ),
    );
    const [playRankingHidden, setPlayRankingHidden] = useState(
        data.playRankingHidden,
    );
    const [playRankingChartHidden, setPlayRankingChartHidden] = useState(
        data.playRankingChartHidden,
    );
    // WHY: 記録が届く前でも見せ方を決められるようにする。画面に並ぶのは届いた
    // キーだけなので、投稿者が自分で足せないと遊ばれるまで設定できない
    const [added, setAdded] = useState<FieldCandidate[]>([]);
    const [addedPlay, setAddedPlay] = useState<FieldCandidate[]>([]);
    const [bulkChart, setBulkChart] = useState<"on" | "off">();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{
        severity: "success" | "error";
        text: string;
    }>();

    function update(key: string, patch: Partial<ScoreFieldSetting>) {
        setFields((current) => ({
            ...current,
            [key]: { ...current[key], ...patch },
        }));
    }

    function updatePlay(key: string, patch: Partial<ScoreFieldSetting>) {
        setPlayFields((current) => ({
            ...current,
            [key]: { ...current[key], ...patch },
        }));
    }

    async function handleSave() {
        setSaving(true);
        setMessage(undefined);
        const res = await saveScoreboardFormat(
            gameId,
            fields,
            playRankingHidden,
            playFields,
            playRankingChartHidden,
        );
        setSaving(false);
        if (res.ok) {
            setSavedFields(fields);
        }
        setMessage(
            res.ok
                ? { severity: "success", text: "保存しました。" }
                : { severity: "error", text: toMessage(res.reason) },
        );
    }

    const candidates = [...data.candidates, ...added];
    const playCandidates = [...data.playCandidates, ...addedPlay];
    const chartKeys = candidates.map((c) => c.key);
    // WHY: 既定の「遊んだ回数」も 1 つのランキングなので対象に含める
    const chartTargets = chartKeys.length + 1;
    const allChartsOn =
        chartKeys.every((key) => !fields[key]?.chartHidden) &&
        !playRankingChartHidden;
    const allChartsOff =
        chartKeys.every((key) => fields[key]?.chartHidden) &&
        playRankingChartHidden;

    function applyBulkChart(hidden: boolean) {
        setFields((current) => {
            const next = { ...current };
            for (const key of chartKeys) {
                next[key] = { ...next[key], chartHidden: hidden };
            }
            return next;
        });
        setPlayRankingChartHidden(hidden);
        setBulkChart(undefined);
    }

    function addKey(
        key: string,
        valueType: ScoreValueType,
        forPlayRecord: boolean,
    ) {
        const candidate: FieldCandidate = {
            key,
            type: valueType,
            recordCount: 0,
            counts: { number: 0, string: 0, boolean: 0 },
            declaredOnly: true,
            configured: true,
            setting: { ...data.defaults, valueType },
        };
        if (forPlayRecord) {
            setAddedPlay((current) => [...current, candidate]);
            setPlayFields((current) => ({
                ...current,
                [key]: { ...candidate.setting },
            }));
        } else {
            setAdded((current) => [...current, candidate]);
            setFields((current) => ({
                ...current,
                [key]: { ...candidate.setting },
            }));
        }
    }

    return (
        <Stack spacing={2}>
            {candidates.length === 0 && (
                <Alert variant="outlined" severity="info">
                    このゲームの記録はまだ 1
                    件も登録されていません。下の「キーを追加する」で、ゲームが登録する予定のキーを先に設定できます。
                </Alert>
            )}
            {candidates.map((candidate) => (
                <FieldCard
                    key={candidate.key}
                    candidate={candidate}
                    setting={fields[candidate.key]}
                    saved={savedFields[candidate.key]}
                    onChange={(patch) => update(candidate.key, patch)}
                />
            ))}
            <AddKeyCard
                existing={candidates.map((c) => c.key)}
                onAdd={(key, valueType) => addKey(key, valueType, false)}
            />
            <>
                <Typography variant="subtitle1" component="h2">
                    プレイ自体の記録
                </Typography>
                <Alert variant="outlined" severity="info">
                    誰の記録でもなく、そのプレイで起きたこととして登録された記録です。
                    順位は付かず、ゲーム全体の数として出ます。
                </Alert>
                {playCandidates.map((candidate) => (
                    <FieldCard
                        key={`play-${candidate.key}`}
                        candidate={candidate}
                        setting={playFields[candidate.key]}
                        onChange={(patch) => updatePlay(candidate.key, patch)}
                        forPlayRecord
                    />
                ))}
                <AddKeyCard
                    existing={playCandidates.map((c) => c.key)}
                    onAdd={(key, valueType) => addKey(key, valueType, true)}
                />
            </>
            <Card variant="outlined">
                <CardContent>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={!playRankingHidden}
                                onChange={(e) =>
                                    setPlayRankingHidden(!e.target.checked)
                                }
                            />
                        }
                        label="「遊んだ回数」のランキングを出す"
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                size="small"
                                checked={!playRankingChartHidden}
                                onChange={(e) =>
                                    setPlayRankingChartHidden(!e.target.checked)
                                }
                            />
                        }
                        label="棒グラフを出す"
                    />
                </CardContent>
            </Card>
            <Card variant="outlined">
                <CardContent>
                    <Typography variant="subtitle1" component="h2">
                        棒グラフをまとめて変える
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                        すべてのランキング（「遊んだ回数」を含む）の設定を一度に変えます。
                    </Typography>
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ flexWrap: "wrap", mt: 1 }}
                    >
                        <Button
                            size="small"
                            variant="outlined"
                            // WHY: すでに全部そうなっているときに押せると、
                            // 押しても何も起きない操作になる
                            disabled={allChartsOn}
                            onClick={(e) => {
                                e.currentTarget.blur();
                                setBulkChart("on");
                            }}
                        >
                            すべて棒グラフを出す
                        </Button>
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={allChartsOff}
                            onClick={(e) => {
                                e.currentTarget.blur();
                                setBulkChart("off");
                            }}
                        >
                            すべて棒グラフを出さない
                        </Button>
                    </Stack>
                </CardContent>
            </Card>
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
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving}
                >
                    保存する
                </Button>
            </Paper>
            <Dialog open={!!bulkChart} onClose={() => setBulkChart(undefined)}>
                <DialogTitle>
                    {bulkChart === "on"
                        ? "すべてのランキングに棒グラフを出しますか"
                        : "すべてのランキングで棒グラフをやめますか"}
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {chartTargets} 件のランキングの設定をまとめて変えます。
                        保存するまでは反映されません。
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="outlined"
                        onClick={() => setBulkChart(undefined)}
                    >
                        キャンセル
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => applyBulkChart(bulkChart === "off")}
                    >
                        変更する
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

function FieldCard({
    candidate,
    setting,
    saved,
    onChange,
    forPlayRecord = false,
}: {
    candidate: FieldCandidate;
    setting: ScoreFieldSetting;
    /** 保存済みの設定。ないときは積み直しの対象にならない */
    saved?: ScoreFieldSetting;
    onChange: (patch: Partial<ScoreFieldSetting>) => void;
    /** プレイ自体の記録の設定か。出せる選択肢が違う */
    forPlayRecord?: boolean;
}) {
    const mixed = presentTypes(candidate.counts).length > 1;
    // WHY: 投稿者が種類を選んでいれば、集計もその種類の値で行う。画面も同じ
    // 種類で出し、実際の値と食い違うときは警告で直してもらう
    const type = setting.valueType ?? candidate.type;
    const isNumber = type === "number";
    const isBoolean = type === "boolean";
    const byRate = isBoolean && setting.aggregate === "rate";
    // WHY: 真偽値の場合でも割合でなく回数で出すときは単位を付けられるように
    const showUnit = isNumber || (isBoolean && !byRate);
    const diagnoses = diagnose(candidate, setting, type);
    const rebuilds = !!saved && affectsTopEntries(saved, setting);
    // 申告した種類と、実際に登録されている種類が食い違っているか
    const mismatched =
        !!setting.valueType &&
        candidate.recordCount > 0 &&
        candidate.counts[setting.valueType] !== candidate.recordCount;
    return (
        <Card variant="outlined">
            <CardContent>
                <Stack spacing={2}>
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "baseline" }}
                    >
                        <Typography variant="subtitle1" component="h2">
                            {candidate.key}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                            {candidate.recordCount === 0
                                ? `${typeLabel(candidate.setting.valueType ?? candidate.type)}・記録なし`
                                : mixed
                                  ? `混在（${describeTypeCounts(candidate.counts)}）`
                                  : `${typeLabel(candidate.type)}・${candidate.recordCount} 件`}
                        </Typography>
                    </Stack>
                    {(candidate.declaredOnly || mismatched || mixed) && (
                        // WHY: 記録が登録される前に決めた種類にあとから間違いに
                        // 気づいた際、修正できるようにする
                        <TextField
                            select
                            label="値の種類"
                            size="small"
                            value={setting.valueType ?? candidate.type}
                            sx={{ width: { sm: 160 } }}
                            onChange={(e) =>
                                onChange(
                                    changeValueType(
                                        setting,
                                        e.target.value as ScoreValueType,
                                    ),
                                )
                            }
                        >
                            <MenuItem value="number">数値</MenuItem>
                            <MenuItem value="boolean">真偽値</MenuItem>
                            <MenuItem value="string">文字列</MenuItem>
                        </TextField>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField
                            label="見出し"
                            size="small"
                            fullWidth
                            placeholder={candidate.key}
                            value={setting.label ?? ""}
                            onChange={(e) =>
                                onChange({ label: e.target.value })
                            }
                            slotProps={{ htmlInput: { maxLength: 40 } }}
                        />
                        {showUnit && (
                            <TextField
                                label="単位"
                                size="small"
                                sx={{ width: { sm: 120 } }}
                                value={setting.unit ?? ""}
                                onChange={(e) =>
                                    onChange({ unit: e.target.value })
                                }
                                slotProps={{ htmlInput: { maxLength: 8 } }}
                            />
                        )}
                    </Stack>
                    {isBoolean && (
                        <TextField
                            select
                            label="表示のしかた"
                            size="small"
                            sx={{ width: { sm: 240 } }}
                            value={byRate ? "rate" : "count"}
                            onChange={(e) =>
                                onChange({
                                    aggregate: e.target
                                        .value as ScoreFieldSetting["aggregate"],
                                })
                            }
                        >
                            <MenuItem value="count">
                                {forPlayRecord
                                    ? "true になったプレイの数"
                                    : "true の回数でランキング"}
                            </MenuItem>
                            <MenuItem value="rate">
                                {forPlayRecord
                                    ? "true になったプレイの割合"
                                    : "全体の達成率"}
                            </MenuItem>
                        </TextField>
                    )}
                    {isNumber && (
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={2}
                        >
                            <TextField
                                select
                                label="上位の決め方"
                                size="small"
                                fullWidth
                                value={setting.direction}
                                onChange={(e) =>
                                    onChange({
                                        direction: e.target
                                            .value as ScoreFieldSetting["direction"],
                                    })
                                }
                            >
                                <MenuItem value="high">高いほど上位</MenuItem>
                                <MenuItem value="low">低いほど上位</MenuItem>
                            </TextField>
                            <TextField
                                select
                                label="代表値"
                                size="small"
                                fullWidth
                                value={setting.aggregate}
                                onChange={(e) =>
                                    onChange({
                                        aggregate: e.target
                                            .value as ScoreFieldSetting["aggregate"],
                                    })
                                }
                            >
                                <MenuItem value="best">最良値</MenuItem>
                                <MenuItem value="latest">最新の値</MenuItem>
                                <MenuItem value="sum">合計</MenuItem>
                                <MenuItem value="count">回数</MenuItem>
                            </TextField>
                            <TextField
                                select
                                label="同じ人の複数ランクイン"
                                size="small"
                                fullWidth
                                value={setting.dedupe}
                                onChange={(e) =>
                                    onChange({
                                        dedupe: e.target
                                            .value as ScoreFieldSetting["dedupe"],
                                    })
                                }
                            >
                                <MenuItem value="best">1 人 1 件だけ</MenuItem>
                                <MenuItem value="all">1 プレイ 1 件</MenuItem>
                            </TextField>
                        </Stack>
                    )}
                    {rebuilds && (
                        <Alert variant="outlined" severity="warning">
                            保存すると、このキーの歴代ランキングを残っている記録から積み直します。
                            古い記録は消えているため、
                            <strong>それより前のランクインは失われます</strong>
                            。
                        </Alert>
                    )}
                    <Stack direction="row" spacing={2}>
                        {isNumber && (
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={setting.showTimestamp}
                                        onChange={(e) =>
                                            onChange({
                                                showTimestamp: e.target.checked,
                                            })
                                        }
                                    />
                                }
                                label="日時を出す"
                            />
                        )}
                        {!forPlayRecord && !byRate && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        size="small"
                                        checked={!setting.chartHidden}
                                        onChange={(e) =>
                                            onChange({
                                                chartHidden: !e.target.checked,
                                            })
                                        }
                                    />
                                }
                                label="棒グラフを出す"
                            />
                        )}
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={setting.hidden}
                                    onChange={(e) =>
                                        onChange({ hidden: e.target.checked })
                                    }
                                />
                            }
                            label="統計ページに出さない"
                        />
                    </Stack>
                    {diagnoses.map((diagnosis) => (
                        <Alert
                            key={diagnosis.text}
                            variant="outlined"
                            severity={diagnosis.severity}
                        >
                            {diagnosis.text}
                        </Alert>
                    ))}
                    {type === "string" && (
                        <Alert variant="outlined" severity="info">
                            文字列の記録は統計ページに表示されません。
                        </Alert>
                    )}
                    {isBoolean && (
                        <Alert variant="outlined" severity="info">
                            {booleanDescription(forPlayRecord, byRate)}
                        </Alert>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
}

function booleanDescription(forPlayRecord: boolean, byRate: boolean) {
    if (!byRate) {
        return forPlayRecord
            ? "真偽値の記録は、true になったプレイの数を表示します（例: クリアされた回数）。"
            : "真偽値の記録は、true になった回数でランキングします（例: クリア回数）。false は数えません。";
    }
    // WHY: 母数は「このキーが記録された数」。失敗時に何も記録しないゲームだと
    // 常に 100% になってしまうので、投稿者に false の記録を促す
    return (
        (forPlayRecord
            ? "真偽値の記録は、このキーが記録されたプレイのうち true だった割合を表示します（例: クリア率）。"
            : "真偽値の記録は、全記録のうち true だった割合を表示します（例: クリア率）。") +
        "失敗したときも false を記録してください。記録されなかったプレイは割合の母数に入りません。"
    );
}

function toMessage(reason: string) {
    switch (reason) {
        case "Unauthorized":
            return "このゲームの投稿者だけが設定できます。";
        case "NotFound":
            return "ゲームが見つかりませんでした。";
        case "InvalidParams":
            return "入力に誤りがあります。見出しや単位の長さを確かめてください。";
        case "Drain":
            return "ただいまメンテナンス中のため保存できません。";
        default:
            return "予期しないエラーが発生しました。時間をおいてリトライしてください。";
    }
}

/**
 * 設定と実際のデータの食い違いを知らせる。
 *
 * WHY: 型の混在は申告の有無に関わらず知らせる。記録が先に届いたキーには申告が
 * 無く、そこでコンテンツ側の取り違えが起きても気づけないため。
 */
function diagnose(
    candidate: FieldCandidate,
    setting: ScoreFieldSetting,
    /** 設定項目をどの種類として出しているか */
    shownAs: ScoreValueType,
): { severity: "info" | "warning"; text: string }[] {
    if (candidate.recordCount === 0) {
        return [
            {
                severity: "info",
                text: "このキーの記録はまだ登録されていません。キー名が合っているか確かめてください。",
            },
        ];
    }
    const result: { severity: "info" | "warning"; text: string }[] = [];
    const mixed = presentTypes(candidate.counts).length > 1;
    if (!candidate.configured) {
        result.push({
            severity: "warning",
            text: mixed
                ? "記録は登録されていますが、見せ方が設定されていません。"
                : `記録は登録されていますが、見せ方が設定されていません。登録されている値は${typeLabel(candidate.type)}です。`,
        });
    }
    const declared = setting.valueType;
    const missingDeclared = !!declared && candidate.counts[declared] === 0;
    if (mixed) {
        result.push({
            severity: "warning",
            text:
                (missingDeclared
                    ? `${typeLabel(declared)}として設定されていますが、${typeLabel(declared)}は登録されていません。`
                    : "") +
                `値の種類が混在しています（${describeTypeCounts(candidate.counts)}）。ゲーム側で登録する値の種類をそろえてください。` +
                (declared
                    ? `設定項目は選んだ${typeLabel(shownAs)}として表示しています。`
                    : `設定項目は件数の多い${typeLabel(shownAs)}として表示しています。値の種類を選ぶと変えられます。`),
        });
    } else if (missingDeclared) {
        result.push({
            severity: "warning",
            text: `${typeLabel(declared)}として設定されていますが、登録されているのは${typeLabel(candidate.type)}だけです。このままでは統計ページに表示されません。${typeLabel(candidate.type)}へ変更してください。`,
        });
    }
    return result;
}

/**
 * WHY: 代表値の選択肢は種類ごとに違う。前の種類の代表値が残ると、画面に出ない
 * 引き方で集計されてしまうので、新しい種類で選べるものへ戻す。
 */
function changeValueType(
    setting: ScoreFieldSetting,
    valueType: ScoreValueType,
): Partial<ScoreFieldSetting> {
    const choices: ScoreFieldSetting["aggregate"][] =
        valueType === "boolean"
            ? ["count", "rate"]
            : ["best", "latest", "sum", "count"];
    return {
        valueType,
        ...(choices.includes(setting.aggregate) ? {} : { aggregate: "count" }),
        // WHY: 真偽値には 1 プレイ 1 件のランキングが無い。数値の上位 N 件が
        // 残ったままだと、真偽値を選んでも数値のランキングが出てしまう
        ...(valueType === "boolean" ? { dedupe: "best" } : {}),
    };
}

function AddKeyCard({
    existing,
    onAdd,
}: {
    existing: string[];
    onAdd: (key: string, valueType: ScoreValueType) => void;
}) {
    const [key, setKey] = useState("");
    const [valueType, setValueType] = useState<ScoreValueType>("number");
    const trimmed = key.trim();
    const duplicated = existing.includes(trimmed);
    const invalid = trimmed.length > 0 && !RECORD_KEY_PATTERN.test(trimmed);
    return (
        <Card variant="outlined">
            <CardContent>
                <Stack spacing={1}>
                    <Typography variant="subtitle2" component="h3">
                        キーを追加する
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                        ゲームが登録する予定のキーを設定できます。
                    </Typography>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        // WHY: Helperの行がある分キー名の欄だけ背が高い。上端で
                        // そろえると、他の欄が浮いて見える
                        sx={{ alignItems: { sm: "flex-start" } }}
                    >
                        <TextField
                            label="キー名"
                            size="small"
                            fullWidth
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            error={invalid || duplicated}
                            helperText={
                                duplicated
                                    ? "すでにあります"
                                    : invalid
                                      ? "半角英数字と _ - : を 1〜32 文字"
                                      : " "
                            }
                            slotProps={{ htmlInput: { maxLength: 32 } }}
                        />
                        <TextField
                            select
                            label="値の種類"
                            size="small"
                            value={valueType}
                            // WHY: キー名の欄にはHelperの行がある。同じ高さの
                            // 余白を持たせて、下端をそろえる
                            helperText=" "
                            sx={{ width: { sm: 160 } }}
                            onChange={(e) =>
                                setValueType(e.target.value as ScoreValueType)
                            }
                        >
                            <MenuItem value="number">数値</MenuItem>
                            <MenuItem value="boolean">真偽値</MenuItem>
                            <MenuItem value="string">文字列</MenuItem>
                        </TextField>
                        <Button
                            variant="outlined"
                            disabled={
                                trimmed.length === 0 || invalid || duplicated
                            }
                            onClick={() => {
                                onAdd(trimmed, valueType);
                                setKey("");
                            }}
                            sx={{ mt: { sm: 0.5 } }}
                        >
                            追加
                        </Button>
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    );
}
