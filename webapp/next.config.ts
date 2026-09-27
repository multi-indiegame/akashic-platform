import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    experimental: {
        // ゲーム (GAME_FILE_MAX_MB) とアイコン (ICON_FILE_MAX_MB) を同一リクエストで
        // 受けるため、合計にエンコードのオーバーヘッド分を足して許可
        serverActions: {
            bodySizeLimit: "32mb",
        },
        proxyClientMaxBodySize: "32mb",
    },
    trailingSlash: true,
    // エージェント向けの指示はリポジトリ直下の CLAUDE.md で管理する
    agentRules: false,
};

export default nextConfig;
