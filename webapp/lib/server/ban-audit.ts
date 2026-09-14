import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "./content-utils";

/** BAN / 解除の要求元。Ban 行には残さず監査ログ側だけで由来を持つ */
export type BanAuditSource = "CHAT" | "IN_GAME" | "SETTINGS" | "BLOCK";

export interface BanRequestAuditRecord {
    /** 設定画面からの解除は部屋に紐づかないため undefined */
    playId?: number;
    source: BanAuditSource;
    action: "BAN" | "UNBAN";
    gmUserId?: string;
    gmGuestId?: string;
    targetUserId?: string;
    targetGuestId?: string;
    /** Ban 行が実際に増減する見込みか。既に同じ BAN があったときは false */
    applied: boolean;
    ip?: string;
    userAgent?: string;
    requestedAt: Date;
}

function getAuditBucket() {
    if (!process.env.S3_AUDIT_BUCKET) {
        throw new Error("S3_AUDIT_BUCKET is required.");
    }
    return process.env.S3_AUDIT_BUCKET;
}

const auditKeyPrefix = process.env.S3_AUDIT_KEY_PREFIX ?? "";

/**
 * BAN / 解除の要求を監査ログとして 1 件 1 オブジェクトで書く。保持期間は
 * バケットのライフサイクル任せなので、アプリ側に削除処理を持たない。
 *
 * 呼び出し側は Ban 行の作成・削除より先にこれを await する（audit-first）。
 * 何が起きたか後から調査できなくなる方が重いリスクであり、S3 障害時はそもそも
 * 他の機能も成立しないため、BANできない不利益は許容する。
 */
export async function archiveBanRequest(record: BanRequestAuditRecord) {
    const iso = record.requestedAt.toISOString();
    const [datePart] = iso.split("T");
    const [yyyy, mm, dd] = datePart.split("-");
    const key = `${auditKeyPrefix}ban-requests/${yyyy}/${mm}/${dd}/${record.playId ?? "global"}/${iso.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: getAuditBucket(),
            Key: key,
            Body: JSON.stringify(record),
            ContentType: "application/json",
        }),
    );
}
