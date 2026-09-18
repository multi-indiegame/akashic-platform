"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@multi-indiegame/persist-schema";
import {
    UserHandleFormState,
    UserHandleResponse,
    UserNameFormState,
} from "../types";
import { getAuth } from "./auth";

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,19}$/;
const RESERVED_HANDLES = new Set(["admin", "api", "live", "help", "support"]);

export async function updateUserNameAction(
    prevState: UserNameFormState,
    formData: FormData,
): Promise<UserNameFormState> {
    const user = await getAuth();
    if (!user || user.authType !== "oauth") {
        return {
            ok: false,
            submitted: true,
            message: "ユーザー名の変更にはサインインが必要です。",
            submittedAt: Date.now(),
        };
    }
    const userId = formData.get("userId")?.toString();
    if (!userId || userId !== user.id) {
        return {
            ok: false,
            submitted: true,
            message: "ユーザー名の更新に失敗しました。",
            submittedAt: Date.now(),
        };
    }
    const name = formData.get("name")?.toString();
    if (!name) {
        return {
            ok: false,
            submitted: true,
            message: "ユーザー名を入力してください。",
            submittedAt: Date.now(),
        };
    }

    await prisma.user.update({
        where: {
            id: user.id,
        },
        data: {
            name,
        },
    });

    revalidatePath(`/user/${user.id}`);
    return {
        ok: true,
        name,
        submitted: true,
        submittedAt: Date.now(),
    };
}

export async function updateUserHandle(
    rawHandle: string,
): Promise<UserHandleResponse> {
    const user = await getAuth();
    if (!user || user.authType !== "oauth") {
        return {
            ok: false,
            reason: "Unauthorized",
        };
    }
    const handle = rawHandle.trim();
    if (!handle) {
        return {
            ok: false,
            reason: "EmptyHandle",
        };
    }
    if (!HANDLE_PATTERN.test(handle)) {
        return {
            ok: false,
            reason: "InvalidFormatHandle",
        };
    }
    if (RESERVED_HANDLES.has(handle)) {
        return {
            ok: false,
            reason: "ForbiddenHandle",
        };
    }
    try {
        await prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                handle,
            },
        });
    } catch (err) {
        if (
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            err.code === "P2002"
        ) {
            return {
                ok: false,
                reason: "HandleAlreadyExists",
            };
        }
        console.warn(
            `failed to update user handle. (userId = "${user.id}", handle = "${handle}")`,
            err,
        );
        return {
            ok: false,
            reason: "InternalError",
        };
    }
    return {
        ok: true,
        handle,
    };
}

export async function updateUserHandleAction(
    prevState: UserHandleFormState,
    formData: FormData,
): Promise<UserHandleFormState> {
    const user = await getAuth();
    if (!user || user.authType !== "oauth") {
        return {
            ok: false,
            submitted: true,
            message: "あなたの部屋IDの設定にはサインインが必要です。",
            submittedAt: Date.now(),
        };
    }
    const result = await updateUserHandle(
        formData.get("handle")?.toString() ?? "",
    );
    let message: string | undefined;
    if (!result.ok) {
        switch (result.reason) {
            case "Unauthorized":
                message = "あなたの部屋IDの設定にはサインインが必要です。";
                break;
            case "EmptyHandle":
                message = "あなたの部屋IDを入力してください。";
                break;
            case "InvalidFormatHandle":
                message =
                    "あなたの部屋IDは2〜20文字の英小文字・数字・アンダースコア・ハイフンで入力してください。先頭は英数字にしてください。";
                break;
            case "ForbiddenHandle":
                message = "その部屋IDは使用できません。";
                break;
            case "HandleAlreadyExists":
                message = "その部屋IDはすでに使用されています。";
                break;
            case "InternalError":
            default:
                message =
                    "予期しないエラーが発生しました。時間をおいてリトライしてください。";
                break;
        }
    }
    revalidatePath(`/user/${user.id}`);
    return {
        ok: result.ok,
        handle: result.ok ? result.handle : undefined,
        message,
        submitted: true,
        submittedAt: Date.now(),
    };
}
