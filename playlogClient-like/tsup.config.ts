import type { Plugin } from "esbuild";
import { defineConfig } from "tsup";
import * as path from "node:path";
import fs from "node:fs";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), path.sep));

const globalName =
    "playlogClientV" + require("./package.json").version.replace(/[\.-]/g, "_");

const licensePlugin: Plugin = {
    name: "license",
    setup: (build) => {
        build.onResolve({ filter: /^socket\.io-client$/ }, (args) => {
            const entryPath = require.resolve(args.path);
            const sep = path.sep === "\\" ? "\\\\" : "\\/";
            const match = entryPath.match(
                new RegExp(
                    `(.*${sep}node_modules${sep}socket\\.io-client)${sep}`,
                ),
            );
            return {
                path: entryPath,
                pluginName: "license",
                pluginData: match ? path.join(match[0], "LICENSE") : undefined,
                namespace: "license-socliet\.io-client",
            };
        });
        build.onLoad(
            { filter: /.*/, namespace: "license-socliet\.io-client" },
            (args) => {
                const contents =
                    fs
                        .readFileSync(args.pluginData, { encoding: "utf-8" })
                        .split("\n")
                        .map((str) => `//! ${str}\n`)
                        .join("") + fs.readFileSync(args.path);
                return {
                    pluginName: "license",
                    resolveDir: path.dirname(args.path),
                    contents,
                };
            },
        );
    },
};

export default defineConfig({
    entry: ["src/index.ts"],
    globalName,
    target: "es6",
    format: ["iife", "cjs"],
    platform: "browser",
    dts: true,
    minify: true,
    esbuildPlugins: [licensePlugin],
    esbuildOptions: (opts) => {
        opts.legalComments = "inline";
    },
    clean: true,
});
