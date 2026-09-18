"use server";

import { prisma, ReportReason } from "@multi-indiegame/persist-schema";
import {
    REPORT_DETAIL_MAX,
    REPORT_REASON_LABELS,
    ReportFormState,
    ReportSource,
} from "../types";
import { getAuth } from "./auth";
import { checkReportRateLimit, resolveReportTarget } from "./report";
import { notifyAdmin } from "./mail";
import { publicBaseUrl } from "./akashic";

function failure(message: string): ReportFormState {
    return { ok: false, message, submitted: true, submittedAt: Date.now() };
}

function success(): ReportFormState {
    return { ok: true, submitted: true, submittedAt: Date.now() };
}

function parseTarget(formData: FormData) {
    const kind = formData.get("kind")?.toString();
    if (kind === "message") {
        const source = formData.get("source")?.toString();
        const messageId = parseInt(formData.get("messageId")?.toString() ?? "");
        if (
            (source !== "board" && source !== "chat") ||
            !Number.isSafeInteger(messageId)
        ) {
            return null;
        }
        return {
            kind: "message" as const,
            source: source as ReportSource,
            messageId,
        };
    }
    if (kind === "play") {
        const playId = parseInt(formData.get("playId")?.toString() ?? "");
        if (!Number.isSafeInteger(playId)) return null;
        return { kind: "play" as const, playId };
    }
    if (kind === "user") {
        const userId = formData.get("userId")?.toString();
        if (!userId) return null;
        return { kind: "user" as const, userId };
    }
    return null;
}

export async function submitReportAction(
    prevState: ReportFormState,
    formData: FormData,
): Promise<ReportFormState> {
    const target = parseTarget(formData);
    const reasonRaw = formData.get("reason")?.toString();
    const detail = formData.get("detail")?.toString().trim() || undefined;

    if (
        !target ||
        !reasonRaw ||
        !(reasonRaw in REPORT_REASON_LABELS) ||
        (detail && detail.length > REPORT_DETAIL_MAX)
    ) {
        return failure("入力内容を確認してください。");
    }
    const reason = reasonRaw as ReportReason;

    // 通報者の特定にはサインインまたはゲスト Cookie が必要
    const user = await getAuth();
    if (!user) {
        return failure("通報するにはページを更新してから再度お試しください。");
    }
    const reporter = {
        userId: user.authType === "oauth" ? user.id : undefined,
        guestId: user.authType === "guest" ? user.id : undefined,
    };

    const resolved = await resolveReportTarget(target, reporter);
    if (!resolved) {
        return failure(
            "対象が見つかりませんでした。既に削除された可能性があります。",
        );
    }
    if (resolved.isSelf) {
        return failure("自分自身は通報できません。");
    }

    const rate = await checkReportRateLimit({
        reporterId: reporter.userId,
        reporterGuestId: reporter.guestId,
    });
    if (!rate.ok) {
        return failure(
            `通報が続いています。${rate.retryAfterSeconds} 秒ほど待ってから再度お試しください。`,
        );
    }

    // 重複通報も握り潰さず必ず記録する。補足やカテゴリ違いを証跡として
    // 残すため。確認・解決は (targetType, targetId) でグループ化して行う
    // （スパムは checkReportRateLimit で抑止済み）。
    let report;
    try {
        report = await prisma.report.create({
            data: {
                targetType: resolved.targetType,
                targetId: resolved.targetId,
                reason,
                detail,
                bodySnapshot: resolved.bodySnapshot,
                reporterId: reporter.userId,
                reporterGuestId: reporter.guestId,
            },
        });
    } catch (err) {
        console.warn("failed to create report", err);
        return failure(
            "予期しないエラーが発生しました。時間をおいてリトライしてください。",
        );
    }

    await notifyAdmin({
        subject: `[通報] #${report.id} ${REPORT_REASON_LABELS[reason]}`,
        body: [
            `通報ID: ${report.id}`,
            `対象種別: ${resolved.targetType}`,
            `対象ID: ${resolved.targetId}`,
            `理由: ${REPORT_REASON_LABELS[reason]}`,
            `対象内容: ${resolved.bodySnapshot}`,
            `補足: ${detail ?? "(なし)"}`,
            `通報者: ${reporter.userId ? `user:${reporter.userId}` : `guest:${reporter.guestId}`}`,
            `管理: ${publicBaseUrl}`,
        ].join("\n"),
    });

    return success();
}
