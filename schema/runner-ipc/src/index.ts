import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";

/**
 * akashic-server が akashic-runner に対して送信するプレイ実行開始要求。
 */
export interface StartPlayRequest {
    playId: number;
    storagePublicUrl: string;
    playToken: string;
    contentUrl: string;
    assetBaseUrl: string;
    configurationUrl: string;
    playerId: string;
    playerName: string;
    maxPreservingTickSize: number;
}

/**
 * akashic-server が akashic-runner に送った停止要求への応答。
 */
export interface StopPlayResponse {
    ok: true;
    crashed: boolean;
    errorLogged: boolean;
}

/**
 * akashic-runner が akashic-server に対して送信するアセット取得要求。
 */
export interface AssetRequest {
    playId: number;
    url: string;
}

/**
 * プレイ終了の発生源。
 * - "runtime-error": 投稿スクリプトの実行時エラー (RunnerV3 の errorTrigger)。
 * - "storage": akashic-storage 発の終了通知 (実質 akashic-storage の強制終了)。
 */
export type PlayEndOrigin = "runtime-error" | "storage";

/**
 * akashic-runner が akashic-server に対して送信するプレイ終了要求。
 */
export interface PlayEndedRequest {
    playId: number;
    reason: PlayEndReason;
    origin: PlayEndOrigin;
}
