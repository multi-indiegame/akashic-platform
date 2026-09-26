import type { PlayEndReason } from "@multi-indiegame/amflow-client-event-schema";

/** 記録に載せられる値 */
export type ScoreboardValue = number | string | boolean;

/** 記録への差分。null はそのキーの削除を表す */
export interface ScoreboardPatch {
    [key: string]: ScoreboardValue | null;
}

/**
 * akashic-runner から akashic-server へ送る、そのプレイの記録の全体。
 *
 * WHY: 差分ではなく丸ごと送る。server は上書きするだけでよく、届く順序を
 * 気にしなくて済む。
 */
export interface ScoreboardRecords {
    /** 部屋そのものの記録 */
    play?: ScoreboardPatch;
    /** in-game playerId ごとの記録 */
    players?: { [playerId: string]: ScoreboardPatch };
}

/**
 * コンテンツに課す上限。省略した項目は拡張ライブラリの既定値が使われる。
 */
export interface ScoreboardLimits {
    keysPerPlayer?: number;
    stringLength?: number;
    playerIdLength?: number;
    subjectsPerPlay?: number;
}

/**
 * プレイ開始時に渡す scoreboard の設定。省略すると external を生やさない。
 */
export interface ScoreboardParameters {
    limits?: ScoreboardLimits;
}

/**
 * akashic-runner が akashic-server に対して送信する記録の更新要求。
 */
export interface ScoreboardUpdateRequest {
    playId: number;
    /** 単調に増える通し番号。server は前回以下を捨てる */
    seq: number;
    records: ScoreboardRecords;
}

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
    /**
     * 記録を受け取るなら指定する。省略すると `g.game.external.scoreboard` を
     * 生やさないので、コンテンツ側の `isSupported()` は false になる。
     */
    scoreboard?: ScoreboardParameters;
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
