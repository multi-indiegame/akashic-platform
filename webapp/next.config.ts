import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    experimental: {
        // アプリ内では GAME_FILE_MAX_MB (クライアントに提示)
        // 少し多めに許可
        serverActions: {
            bodySizeLimit: "32mb",
        },
        proxyClientMaxBodySize: "32mb",
    },
    trailingSlash: true,
};

export default nextConfig;
