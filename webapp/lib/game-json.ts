import type { Environment } from "@akashic/game-configuration";
import { supportedAkashicModes, supportedAkashicVersions } from "./types";

type ModeKey = "nicolive" | "niconico";

export type GameJsonEnvironmentError =
    | {
          reason: "MissingVersion";
          hasAkashicRuntime: boolean;
      }
    | {
          reason: "UnsupportedVersion";
          actual: string;
          typeMismatch: boolean;
      }
    | {
          reason: "MissingMode";
          modeKey?: ModeKey;
          ignoredNiconicoModes: boolean;
          environmentKeys: string[];
      }
    | {
          reason: "UnsupportedMode";
          modeKey: ModeKey;
          actual: string;
          notArray: boolean;
      };

export type GameJsonEnvironmentWarning =
    "DeprecatedNiconico" | "IgnoredNiconico";

export interface GameJsonEnvironmentCheckResult {
    error?: GameJsonEnvironmentError;
    warnings: GameJsonEnvironmentWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// game.json は投稿者が任意に書けるため、応答・画面・ログに載せる値は長さを制限する
const MAX_VALUE_LENGTH = 200;
const MAX_ENVIRONMENT_KEYS = 20;

export function truncate(text: string, maxLength = MAX_VALUE_LENGTH) {
    return text.length > maxLength
        ? `${text.slice(0, maxLength)}…(${text.length} 文字中 ${maxLength} 文字を表示)`
        : text;
}

function stringify(value: unknown) {
    return truncate(JSON.stringify(value) ?? String(value));
}

export function getGameJsonEnvironment(gameJson: unknown) {
    return isRecord(gameJson) && isRecord(gameJson.environment)
        ? (gameJson.environment as Environment)
        : undefined;
}

/**
 * game.json の environment が本サイトで実行可能か検証する。
 * サーバーでの投稿可否判定と、ファイル選択時のクライアント側事前チェックで共用する。
 */
export function checkGameJsonEnvironment(
    gameJson: unknown,
): GameJsonEnvironmentCheckResult {
    const environment = getGameJsonEnvironment(gameJson);
    const warnings: GameJsonEnvironmentWarning[] = [];

    // headless-driver や akashic serve はエンジンのバージョンを sandbox-runtime のみで決め、
    // 省略時は "1" とみなす。akashic-runtime は export zip --nicolive が追記するだけの値
    const version: unknown = environment?.["sandbox-runtime"];
    if (version == null) {
        return {
            error: {
                reason: "MissingVersion",
                hasAkashicRuntime: environment?.["akashic-runtime"] != null,
            },
            warnings,
        };
    }
    if (!supportedAkashicVersions.some((ver) => ver === version)) {
        return {
            error: {
                reason: "UnsupportedVersion",
                actual: stringify(version),
                typeMismatch:
                    typeof version !== "string" &&
                    supportedAkashicVersions.includes(String(version)),
            },
            warnings,
        };
    }

    // ニコ生ゲームの仕様では niconico は非推奨だが当面サポートされ、
    // nicolive と両方ある場合は niconico が無視される
    const hasNicolive = environment?.nicolive != null;
    const hasNiconico = environment?.niconico != null;
    const modeKey: ModeKey | undefined = hasNicolive
        ? "nicolive"
        : hasNiconico
          ? "niconico"
          : undefined;
    if (hasNicolive && hasNiconico) {
        warnings.push("IgnoredNiconico");
    } else if (hasNiconico) {
        warnings.push("DeprecatedNiconico");
    }

    const modes: unknown = modeKey
        ? (environment?.[modeKey] as Record<string, unknown> | undefined)
              ?.supportedModes
        : undefined;
    if (modeKey == null || modes == null) {
        const ignoredNiconicoModes =
            modeKey === "nicolive" &&
            (environment?.niconico as Record<string, unknown>)
                ?.supportedModes != null;
        return {
            error: {
                reason: "MissingMode",
                modeKey,
                ignoredNiconicoModes,
                environmentKeys: environment
                    ? Object.keys(environment)
                          .slice(0, MAX_ENVIRONMENT_KEYS)
                          .map((key) => truncate(key, 50))
                    : [],
            },
            // エラー文で同じ内容を案内するため重複させない
            warnings: ignoredNiconicoModes ? [] : warnings,
        };
    }
    if (
        !Array.isArray(modes) ||
        !modes.some((mode) =>
            supportedAkashicModes.some((supported) => supported === mode),
        )
    ) {
        return {
            error: {
                reason: "UnsupportedMode",
                modeKey,
                actual: stringify(modes),
                notArray: !Array.isArray(modes),
            },
            warnings,
        };
    }
    return { warnings };
}

const modeExample = `"environment": { "nicolive": { "supportedModes": ["multi_admission"] } }`;

export function describeGameJsonEnvironmentError(
    error: GameJsonEnvironmentError,
): string {
    const supportedModesText = supportedAkashicModes
        .map((m) => `"${m}"`)
        .join(" または ");
    switch (error.reason) {
        case "MissingVersion":
            return (
                "game.json に environment.sandbox-runtime が指定されていません。" +
                `Akashic Engine v3 で作成したゲームの場合は "environment": { "sandbox-runtime": "3" } を追加してください` +
                "(省略すると v1 のゲームとして扱われるため投稿できません)。" +
                (error.hasAkashicRuntime
                    ? "なお environment.akashic-runtime はエンジンのバージョン判定には使われません。"
                    : "")
            );
        case "UnsupportedVersion":
            if (error.typeMismatch) {
                return (
                    `game.json の environment.sandbox-runtime が ${error.actual} (数値) になっています。` +
                    `"3" のように文字列で指定してください。`
                );
            }
            return (
                `game.json の environment.sandbox-runtime の値 ${error.actual} には対応していません。` +
                `投稿できるのは Akashic Engine v3 で作成したゲーム (${supportedAkashicVersions.map((v) => `"${v}"`).join()}) のみです。`
            );
        case "MissingMode":
            if (error.ignoredNiconicoModes) {
                return (
                    "game.json に environment.nicolive と environment.niconico が両方あり、" +
                    "environment.nicolive に supportedModes が指定されていません。" +
                    "両方ある場合 environment.niconico は無視されるため、" +
                    "supportedModes を environment.nicolive に移し、environment.niconico は削除してください。"
                );
            }
            if (error.modeKey) {
                return (
                    `game.json の environment.${error.modeKey} に supportedModes が指定されていません。` +
                    `${modeExample} のように指定してください。`
                );
            }
            return (
                "game.json に environment.nicolive.supportedModes が指定されていません。" +
                `${modeExample} のように指定してください。` +
                (error.environmentKeys.length > 0
                    ? `キー名の綴りも確認してください (environment 内のキー: ${error.environmentKeys.map((k) => `"${k}"`).join(", ")})。`
                    : "")
            );
        case "UnsupportedMode":
            if (error.notArray) {
                return (
                    `game.json の environment.${error.modeKey}.supportedModes が配列になっていません (指定値: ${error.actual})。` +
                    `["multi_admission"] のように配列で指定してください。`
                );
            }
            return (
                `game.json の environment.${error.modeKey}.supportedModes ${error.actual} に対応するモードが含まれていません。` +
                `マルチプレイ用の ${supportedModesText} を含めてください。`
            );
    }
}

export function describeGameJsonEnvironmentWarning(
    warning: GameJsonEnvironmentWarning,
): string {
    switch (warning) {
        case "DeprecatedNiconico":
            return (
                "game.json の environment.niconico は旧仕様の書き方です。" +
                "現在は投稿できますが、今後サポートを終了する可能性があり、他のゲーム実行サービスでは受け付けられないこともあります。" +
                "environment.niconico を environment.nicolive に書き換えることをおすすめします。"
            );
        case "IgnoredNiconico":
            return (
                "game.json に environment.nicolive と environment.niconico が両方指定されています。" +
                "この場合 environment.niconico は無視され、environment.nicolive の設定が使われます。" +
                "旧仕様の environment.niconico は削除してください。"
            );
    }
}
