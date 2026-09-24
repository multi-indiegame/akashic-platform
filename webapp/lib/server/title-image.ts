import { randomBytes } from "node:crypto";
import path from "node:path";
import {
    DeleteObjectCommand,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
    contentTypeFromName,
    getBucket,
    getS3Client,
    s3KeyPrefix,
} from "./content-utils";
import { logSafe } from "./log-safe";

/**
 * 称号の画像の置き場。
 *
 * WHY: コンテンツ配信用のバケットの直下は、コンテンツ 1 件につき 1 つの
 * ディレクトリ（`<contentId>/`）という決まりで使っている。称号はゲームに紐づく
 * ので、そこへは置けない。ログ（`content-logs/`）と同じく、トップに用途ごとの
 * ディレクトリを切る。
 *
 * WHY: 1 ゲームに称号は何件でもあるので、`games/<gameId>/titles/` の下に
 * 称号ごとのファイルを置く。ファイル名に毎回違う文字列を混ぜるのは、配信の
 * 手前に挟まる仕組みが古い画像を返さないようにするため。
 */
const TITLES_DIR = "games";

/** 称号画像の上限。アイコンと同じ扱い */
export const TITLE_IMAGE_MAX_BYTES = 1024 * 1024;

const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

export function isAllowedTitleImage(file: File): boolean {
    return (
        file.size > 0 &&
        file.size <= TITLE_IMAGE_MAX_BYTES &&
        ALLOWED_EXTENSIONS.includes(path.extname(file.name).toLowerCase())
    );
}

/** 保存する鍵。`imageKey` にはこの値をそのまま入れる */
export function toTitleImageKey(
    gameId: number,
    defId: number,
    file: File,
): string {
    const suffix = randomBytes(3).toString("hex");
    const ext = path.extname(file.name).toLowerCase();
    return `${TITLES_DIR}/${gameId}/titles/${defId}-${suffix}${ext}`;
}

export async function uploadTitleImage(
    key: string,
    file: File,
): Promise<void> {
    await getS3Client().send(
        new PutObjectCommand({
            Bucket: getBucket(),
            Key: `${s3KeyPrefix}${key}`,
            Body: await file.bytes(),
            ContentType: contentTypeFromName(key),
        }),
    );
}

/**
 * WHY: 消せなくても称号の変更は通す。残ったファイルは誰からも参照されない
 * （`imageKey` が別の鍵に変わっている）。
 */
export async function deleteTitleImage(key: string): Promise<void> {
    try {
        await getS3Client().send(
            new DeleteObjectCommand({
                Bucket: getBucket(),
                Key: `${s3KeyPrefix}${key}`,
            }),
        );
    } catch (err) {
        console.warn(
            "failed to delete title image (key = %s)",
            logSafe(key),
            err,
        );
    }
}
