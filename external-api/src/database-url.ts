/**
 * DB の接続文字列を決める。
 * `DATABASE_URL_PARAMETER` に SSM のパラメータ名があれば、AWS Parameters and Secrets
 * Lambda Extension から取得する。無ければ `DATABASE_URL` を使う。
 */
export async function resolveDatabaseUrl(
    env: Record<string, string | undefined>,
    fetchFn: typeof fetch = fetch,
) {
    const parameterName = env.DATABASE_URL_PARAMETER;
    if (!parameterName) {
        return env.DATABASE_URL;
    }
    const port = env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT ?? "2773";
    const query = new URLSearchParams({
        name: parameterName,
        withDecryption: "true",
    });
    const res = await fetchFn(
        `http://localhost:${port}/systemsmanager/parameters/get?${query}`,
        {
            headers: {
                "X-Aws-Parameters-Secrets-Token": env.AWS_SESSION_TOKEN ?? "",
            },
        },
    );
    if (!res.ok) {
        throw new Error(
            `failed to get parameter from extension (name = "${parameterName}", status = ${res.status})`,
        );
    }
    const body = (await res.json()) as { Parameter?: { Value?: unknown } };
    const value = body.Parameter?.Value;
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`parameter has no value (name = "${parameterName}")`);
    }
    return value;
}
