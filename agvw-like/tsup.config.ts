import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    target: "es6",
    format: "esm",
    platform: "browser",
    dts: true,
    clean: true,
    // 下記パッケージは不要なものの、エラー時に require() を試みる処理に tsup が反応してしまうため明示的に除外
    external: [
        "@akashic/akashic-engine",
        "@akashic/game-driver",
        "@akashic/pdi-browser",
        "@multi-indiegame/playlog-client",
    ],
});
