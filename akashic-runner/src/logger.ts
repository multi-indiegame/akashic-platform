import { AsyncLocalStorage } from "node:async_hooks";
import util from "node:util";

export interface LogSink {
    write(line: string): void;
}

export interface PlayContext {
    playId: number;
    onError?: () => void;
    logSink?: LogSink;
}

export const playStorage = new AsyncLocalStorage<PlayContext>();

const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);

export function formatLine(
    level: "info" | "warn" | "error",
    playId: number | undefined,
    message: string,
) {
    return JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        playId,
        message,
    });
}

/**
 * content-log 転送層自身の失敗を記録する。
 *
 * console.warn を使うと転送バッファに積まれ、「転送失敗 → 記録 → また転送失敗」
 * の循環になるため、標準出力だけに出す。
 */
export function warnTransport(...args: unknown[]) {
    origWarn(
        formatLine(
            "warn",
            playStorage.getStore()?.playId,
            util.format(...args),
        ),
    );
}

export function installConsoleOverride({ echo = true } = {}) {
    const patchedLog = (
        level: "info" | "warn" | "error",
        args: unknown[],
        output: (line: string) => void,
    ) => {
        const ctx = playStorage.getStore();
        if (ctx == null) {
            output(util.format(...args));
            return;
        }
        let message = util.format(...args);
        if (level === "error" && !args.some((a) => a instanceof Error)) {
            const callStack = new Error().stack;
            if (callStack) {
                const trimmed = callStack.split("\n").slice(2).join("\n");
                message += "\n" + trimmed;
            }
        }
        const line = formatLine(level, ctx.playId, message);
        ctx.logSink?.write(line + "\n");
        if (echo) {
            output(line);
        }
    };

    console.log = (...args: unknown[]) => patchedLog("info", args, origLog);
    console.info = (...args: unknown[]) => patchedLog("info", args, origLog);
    console.debug = (...args: unknown[]) => patchedLog("info", args, origLog);
    console.warn = (...args: unknown[]) => patchedLog("warn", args, origWarn);
    console.error = (...args: unknown[]) => {
        patchedLog("error", args, origError);
        playStorage.getStore()?.onError?.();
    };
}
