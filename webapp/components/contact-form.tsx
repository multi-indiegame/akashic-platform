"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
    Alert,
    Box,
    Button,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { Send } from "@mui/icons-material";
import {
    CONTACT_BODY_MAX,
    CONTACT_NAME_MAX,
    ContactFormState,
} from "@/lib/types";
import { useAuth } from "@/lib/client/useAuth";
import { submitContactAction } from "@/lib/server/contact-action";

const initialState: ContactFormState = { ok: true, submitted: false };

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button
            startIcon={<Send />}
            type="submit"
            variant="contained"
            disabled={pending}
            sx={{ alignSelf: "flex-start" }}
        >
            送信する
        </Button>
    );
}

export function ContactForm() {
    const [user] = useAuth();
    const [state, formAction] = useActionState(
        submitContactAction,
        initialState,
    );
    const [body, setBody] = useState("");
    const isOAuth = user?.authType === "oauth";

    useEffect(() => {
        if (state.submitted && state.ok) {
            setBody("");
        }
    }, [state.submitted, state.ok, state.submittedAt]);

    return (
        <Box sx={{ maxWidth: "sm", mx: "auto", py: 4, px: { xs: 2, sm: 0 } }}>
            <Stack spacing={2}>
                <Typography variant="h5" component="h1">
                    お問い合わせ
                </Typography>
                <Typography variant="body2" color="textSecondary">
                    ご意見・ご要望・不具合の報告、通報後の個別のご相談などにご利用ください。返信が必要な場合は返信先メールアドレスをご記入ください。運営から個別にメールでご連絡します。
                </Typography>

                {state.submitted && state.ok && (
                    <Alert variant="outlined" severity="success">
                        お問い合わせを受け付けました。ありがとうございます。
                    </Alert>
                )}
                {state.submitted && !state.ok && (
                    <Alert variant="outlined" severity="warning">
                        {state.message}
                    </Alert>
                )}

                <Stack component="form" action={formAction} spacing={2}>
                    {isOAuth ? (
                        <TextField
                            label="お名前"
                            value={user.name}
                            disabled
                            size="small"
                        />
                    ) : (
                        <TextField
                            label="お名前（任意）"
                            name="name"
                            placeholder="ゲスト"
                            size="small"
                            slotProps={{
                                htmlInput: { maxLength: CONTACT_NAME_MAX },
                            }}
                        />
                    )}
                    <TextField
                        label="返信先メールアドレス（任意）"
                        name="replyEmail"
                        type="email"
                        size="small"
                        helperText="ご記入いただいた場合のみ、運営から返信します。"
                    />
                    <TextField
                        label="お問い合わせ内容"
                        name="body"
                        required
                        multiline
                        minRows={5}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        slotProps={{
                            htmlInput: { maxLength: CONTACT_BODY_MAX },
                        }}
                    />
                    <SubmitButton />
                </Stack>
            </Stack>
        </Box>
    );
}
