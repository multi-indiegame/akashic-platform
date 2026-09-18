"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import {
    FeedbackFormState,
    postFeedbackReplyAction,
} from "@/lib/server/feedback";

const initialState: FeedbackFormState = {
    ok: true,
    submitted: false,
};

function SubmitButton({ label }: { label: string }) {
    const { pending } = useFormStatus();
    return (
        <Button variant="contained" type="submit" disabled={pending}>
            {label}
        </Button>
    );
}

export function FeedbackReplyForm({
    postId,
    onRefresh,
}: {
    postId: number;
    onRefresh?: () => void;
}) {
    const router = useRouter();
    const [state, action] = useActionState(
        postFeedbackReplyAction,
        initialState,
    );
    const [body, setBody] = useState("");

    useEffect(() => {
        if (state.submitted && state.ok && state.submittedAt) {
            setBody("");
            onRefresh?.();
            router.refresh();
        }
    }, [state.submitted, state.ok, state.submittedAt, router, onRefresh]);

    return (
        <form action={action}>
            <Stack spacing={2}>
                <Typography variant="subtitle2">返信する</Typography>
                <input type="hidden" name="postId" value={postId} />
                <TextField
                    label="返信"
                    name="body"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                />
                {!state.ok && state.submitted && (
                    <Alert severity="error" variant="outlined">
                        {state.message}
                    </Alert>
                )}
                <SubmitButton label="返信する" />
            </Stack>
        </form>
    );
}
