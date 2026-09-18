import type * as g from "@akashic/akashic-engine";
import type * as GameDriver from "@akashic/game-driver";
import type * as PdiBrowser from "@akashic/pdi-browser";
import type * as PlaylogClient from "@multi-indiegame/playlog-client";
import { ErrorFactory } from "./Error";

export const isPlaylogClientUrl = (url: string) =>
    /\/playlogClientV[^/]*\.js$/.test(url);

export const findPlaylogClientUrl = (urls: string[]) =>
    urls.find((url) => isPlaylogClientUrl(url));

export const detectPlaylogClientObject = (win: Window, url: string) => {
    const m = url.match(/\/(playlogClientV[^/]*)\.js$/);
    if (m) {
        return win[m[1] as keyof Window] as typeof PlaylogClient;
    } else {
        return null;
    }
};

export const isEngineFilesUrl = (url: string) =>
    /\/engineFilesV[^/]*\.js$/.test(url);

export const detectEngineFilesObject = (win: Window, url: string) => {
    const m = url.match(/\/(engineFilesV[^/]*)\.js$/);
    if (m && win[m[1] as keyof Window]) {
        const engineFile = win[m[1] as keyof Window];
        return {
            g: engineFile.akashicEngine as typeof g,
            GameDriver: engineFile.gameDriver as typeof GameDriver,
            PdiBrowser: engineFile.pdiBrowser as typeof PdiBrowser,
        };
    }
    return null;
};

export const detectRuntimes = (win: Window, urls: string[]) => {
    const engineFileUrl = urls.find((url) => isEngineFilesUrl(url));
    let _g: typeof g | null = null;
    let _GameDriver: typeof GameDriver | null = null;
    let _PdiBrowser: typeof PdiBrowser | null = null;
    let playlogClient: typeof PlaylogClient | null = null;
    if (engineFileUrl) {
        const engineFile = detectEngineFilesObject(win, engineFileUrl);
        if (engineFile) {
            _g = engineFile.g;
            _GameDriver = engineFile.GameDriver;
            _PdiBrowser = engineFile.PdiBrowser;
        }
    }
    const playlogClientUrl = findPlaylogClientUrl(urls);
    if (playlogClientUrl) {
        const obj = detectPlaylogClientObject(win, playlogClientUrl);
        if (obj) {
            playlogClient = obj;
        }
    }
    if (_g && _GameDriver && _PdiBrowser && playlogClient) {
        return [
            null,
            {
                g: _g,
                GameDriver: _GameDriver,
                PdiBrowser: _PdiBrowser,
                PlaylogClient: playlogClient,
            },
        ] as const;
    } else {
        try {
            if (!_g) {
                _g = require("@akashic/akashic-engine");
            }
            if (!_GameDriver) {
                _GameDriver = require("@akashic/game-driver");
            }
            if (!_PdiBrowser) {
                _PdiBrowser = require("@akashic/pdi-browser");
            }
            if (!playlogClient) {
                playlogClient = require("@multi-indiegame/playlog-client");
            }
            if (_g && _GameDriver && _PdiBrowser && playlogClient) {
                return [
                    null,
                    {
                        g: _g,
                        GameDriver: _GameDriver,
                        PdiBrowser: _PdiBrowser,
                        PlaylogClient: playlogClient,
                    },
                ] as const;
            } else {
                return [
                    ErrorFactory.createLoadModuleError(
                        new Error("unknown failure for require()"),
                    ),
                    null,
                ] as const;
            }
        } catch (e) {
            return [
                ErrorFactory.createLoadModuleError(e as Error),
                null,
            ] as const;
        }
    }
};
