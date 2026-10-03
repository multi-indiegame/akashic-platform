import type { GameConfiguration } from "@akashic/game-configuration";

const implicitExternalMapper: { external: string; keywords: string[] }[] = [
    {
        external: "coe",
        keywords: ["@akashic-extension/coe"],
    },
];

/**
 * coe plugin は game.json に明示的に使われていることが現れないので別途判定
 */
function getImplicitExternal(gameJson: GameConfiguration) {
    const externals = new Set<string>();
    for (const { external, keywords } of implicitExternalMapper) {
        if (
            Object.keys(gameJson.moduleMainPaths ?? {}).some((main) =>
                keywords.includes(main),
            )
        ) {
            externals.add(external);
            continue;
        }
        if (
            Object.keys(gameJson.moduleMainScripts ?? {}).some((main) =>
                keywords.includes(main),
            )
        ) {
            externals.add(external);
            continue;
        }
        if (
            gameJson.globalScripts?.some((script) =>
                // 前方一致によるご判定を防止するため / をつけている
                keywords.some((keyword) => script.includes(`${keyword}/`)),
            )
        ) {
            externals.add(external);
            continue;
        }
    }
    return [...externals];
}

/**
 * コンテンツが使う拡張プラグイン名の一覧。
 * 投稿時の記録 (サーバー) と、ファイル選択時の必須 / 任意の入力欄 (ブラウザ) で共用する。
 */
export function listContentExternals(gameJson: GameConfiguration) {
    const explicitExternal = Object.keys(gameJson.environment?.external ?? {});
    const implicitExternal = getImplicitExternal(gameJson);
    return [...new Set([...implicitExternal, ...explicitExternal])];
}

// game.json の external は投稿者が任意に書けるため、記録する数と名前の長さを制限する
export const MAX_CONTENT_EXTERNALS = 50;
export const MAX_EXTERNAL_NAME_LENGTH = 100;

export function exceedsContentExternalLimits(externals: string[]) {
    return (
        externals.length > MAX_CONTENT_EXTERNALS ||
        externals.some((name) => name.length > MAX_EXTERNAL_NAME_LENGTH)
    );
}
