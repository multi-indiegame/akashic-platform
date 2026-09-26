"use client";

import { useEffect, useState, useTransition } from "react";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControl,
    FormControlLabel,
    Radio,
    RadioGroup,
    TextField,
} from "@mui/material";
import { Flag } from "@mui/icons-material";
import {
    REPORT_DETAIL_MAX,
    REPORT_REASON_LABELS,
    REPORT_REASONS,
    ReportFormState,
    ReportTargetInput,
} from "@/lib/types";
import { submitReportAction } from "@/lib/server/report-action";

const initialState: ReportFormState = { ok: true, submitted: false };

function buildFormData(
    target: ReportTargetInput,
    reason: string,
    detail: string,
) {
    const fd = new FormData();
    fd.set("reason", reason);
    if (detail.trim()) {
        fd.set("detail", detail.trim());
    }
    fd.set("kind", target.kind);
    if (target.kind === "message") {
        fd.set("source", target.source);
        fd.set("messageId", `${target.messageId}`);
    } else if (target.kind === "play") {
        fd.set("playId", `${target.playId}`);
    } else {
        fd.set("userId", target.userId);
    }
    return fd;
}

export function ReportDialog({
    open,
    onClose,
    target,
    title = "通報する",
    description = "この内容を運営に通報します。相手には通知されません。",
}: {
    open: boolean;
    onClose: () => void;
    target: ReportTargetInput;
    title?: string;
    description?: string;
}) {
    const [reason, setReason] = useState<string>("");
    const [detail, setDetail] = useState("");
    const [state, setState] = useState<ReportFormState>(initialState);
    const [pending, startTransition] = useTransition();

    // 開き直したら前回の入力・結果を持ち越さない
    useEffect(() => {
        if (open) {
            setReason("");
            setDetail("");
            setState(initialState);
        }
    }, [open]);

    const submit = () => {
        if (!reason) {
            setState({
                ok: false,
                submitted: true,
                message: "理由を選択してください。",
                submittedAt: Date.now(),
            });
            return;
        }
        startTransition(async () => {
            const next = await submitReportAction(
                initialState,
                buildFormData(target, reason, detail),
            );
            setState(next);
            if (next.ok && next.submitted) {
                // 完了メッセージを見せてから閉じる
                setTimeout(onClose, 1200);
            }
        });
    };

    const done = state.ok && state.submitted;

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <DialogContentText variant="body2">
                    {description}
                </DialogContentText>
                {done ? (
                    <Alert variant="outlined" severity="success" sx={{ mt: 2 }}>
                        通報を受け付けました。ご協力ありがとうございます。
                    </Alert>
                ) : (
                    <>
                        <FormControl sx={{ mt: 2 }}>
                            <RadioGroup
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            >
                                {REPORT_REASONS.map((r) => (
                                    <FormControlLabel
                                        key={r}
                                        value={r}
                                        control={<Radio size="small" />}
                                        label={REPORT_REASON_LABELS[r]}
                                    />
                                ))}
                            </RadioGroup>
                        </FormControl>
                        <TextField
                            fullWidth
                            multiline
                            minRows={2}
                            size="small"
                            label="補足（任意）"
                            value={detail}
                            onChange={(e) => setDetail(e.target.value)}
                            slotProps={{
                                htmlInput: { maxLength: REPORT_DETAIL_MAX },
                            }}
                            sx={{ mt: 1 }}
                        />
                        {!state.ok && state.submitted && (
                            <Alert
                                variant="outlined"
                                severity="warning"
                                sx={{ mt: 1 }}
                            >
                                {state.message}
                            </Alert>
                        )}
                    </>
                )}
                {!done && (
                    <DialogActions>
                        <Button
                            variant="outlined"
                            color="inherit"
                            onClick={onClose}
                            disabled={pending}
                        >
                            キャンセル
                        </Button>
                        <Button
                            startIcon={<Flag />}
                            onClick={submit}
                            variant="contained"
                            color="error"
                            disabled={pending}
                        >
                            通報する
                        </Button>
                    </DialogActions>
                )}
            </DialogContent>
        </Dialog>
    );
}
