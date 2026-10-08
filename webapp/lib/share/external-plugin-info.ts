export interface ExternalPluginInfo {
    /** 投稿フォームで、必須 / 任意を判断する手がかりとして投稿者に見せる説明 */
    description: string;
    /** 詳しい説明の参照先 */
    url?: string;
}

/**
 * game.json の environment.external の名前 (と暗黙の coe) ごとの説明。
 * 載っていないプラグインは名前だけを表示する。
 */
export const externalPluginInfos: Record<string, ExternalPluginInfo> = {
    atsumaru: {
        description:
            "ゲームアツマールのスコアボード機能を使用するプラグインでした。ゲーム内で window.RPGAtsumaru の存在で条件分岐していれば任意でOK。",
    },
    coe: {
        description:
            "COE (co-experience framework) を使うゲームが使用するプラグインです。",
        url: "https://github.com/akashic-games/coe",
    },
    coeLimited: {
        description:
            "ユーザー名を取得するプラグインです。対応していない環境では、自動でゲスト名を割り当てるダイアログが表示されます。(@akashic-extension/resolve-player-info)",
        url: "https://akashic-games.github.io/shin-ichiba/multi/player-info.html",
    },
    instanceStorageLimited: {
        description:
            "端末・ブラウザに値を保存するプラグインです。(@akashic-extension/instance-storage)",
        url: "https://akashic-games.github.io/shin-ichiba/multi/instance-storage.html",
    },
    namagameComment: {
        description:
            "サービス側に投稿されたコメントをゲーム内に表示するプラグインです。ゲーム内で g.game.external.namagameComment の存在で条件分岐していれば任意でOK。",
        url: "https://akashic-games.github.io/shin-ichiba/multi/comment.html",
    },
    playerBan: {
        description:
            "サービスと連動してプレイヤーをゲームから追放するプラグインです。(@multi-indiegame/akashic-player-ban)",
        url: "https://github.com/multi-indiegame/akashic-player-ban",
    },
    scoreboard: {
        description:
            "ゲームの記録をサービスのスコアボードに記録するプラグインです。(@multi-indiegame/akashic-scoreboard)",
        url: "https://github.com/multi-indiegame/akashic-scoreboard",
    },
    send: {
        description:
            "akashic export コマンドが出力時に自動で追加するものです。ゲームの開発者向けの公開機能ではありません。",
    },
};
