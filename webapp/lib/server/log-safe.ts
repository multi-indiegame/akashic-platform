// 改行を含む値をそのまま出力すると、ログに偽の行を混入させられる (log injection)
export function logSafe(value: unknown): string {
    return String(value).replace(/[\r\n]/g, " ");
}
