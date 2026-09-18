#!/usr/bin/env node
/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2019 DWANGO Co., Ltd.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */
// Original Source: https://github.com/akashic-games/akashic-cli/blob/main/packages/akashic-cli-serve/build/updateEngineFiles.js
// Modified by multi-indiegame.
// * remove v1, v2 from versions.
// * change destdir path.
// * create destdir initially.
// * use release engineFile instead of debug that.
// * remove build enviroment specifical code of original repository.
// * append license comments to distribution file.
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const versions = {
    v3: {
        version: "",
        fileName: "",
    },
};

try {
    console.log("start to copy engineFiles");
    const destDir = path.resolve(__dirname, "..", "public", "akashic");
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    for (let key of Object.keys(versions)) {
        const entryPath = require.resolve(`engine-files-${key}`);
        const rootPath = path.dirname(entryPath); // index.js と package.json が同層にあることが前提
        const version = require(path.join(rootPath, "package.json")).version;
        const fileName = `engineFilesV${version.replace(/[\.-]/g, "_")}.js`;
        const engineFilesPath = path.join(
            rootPath,
            `dist/raw/release/full/${fileName}`,
        );

        versions[key].version = version;
        versions[key].fileName = fileName;

        const destPath = path.join(destDir, fileName);

        const license = fs
            .readFileSync(path.join(rootPath, "LICENSE"), {
                encoding: "utf-8",
            })
            .split("\n")
            .map((str) => `//! ${str}\n`)
            .join("");
        fs.writeFileSync(destPath, license, { encoding: "utf-8" });
        fs.appendFileSync(destPath, fs.readFileSync(engineFilesPath), {
            encoding: "utf-8",
        });
    }
    console.log("end to copy engineFiles");

    console.log("start to generate engineFilesVersion.json");
    const versionFilePath = path.resolve(
        __dirname,
        "..",
        "config",
        "engineFilesVersion.json",
    );
    const versionFileDir = path.dirname(versionFilePath);
    if (!fs.existsSync(versionFileDir)) {
        fs.mkdirSync(versionFileDir);
    }
    fs.writeFileSync(versionFilePath, JSON.stringify(versions, null, 2));
    console.log("end to generate files");
} catch (e) {
    console.error(e);
    process.exit(1);
}
