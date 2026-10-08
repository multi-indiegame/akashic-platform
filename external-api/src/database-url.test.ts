import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDatabaseUrl } from "./database-url.ts";

function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
        calls.push({
            url,
            headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return { fn, calls };
}

test("パラメータ名が無ければ DATABASE_URL を使う", async () => {
    const { fn, calls } = fakeFetch(200, {});
    assert.equal(
        await resolveDatabaseUrl({ DATABASE_URL: "postgres://env" }, fn),
        "postgres://env",
    );
    assert.equal(calls.length, 0);
});

test("パラメータ名があれば拡張機能から取得する", async () => {
    const { fn, calls } = fakeFetch(200, {
        Parameter: { Value: "postgres://ssm" },
    });
    const url = await resolveDatabaseUrl(
        {
            DATABASE_URL: "postgres://env",
            DATABASE_URL_PARAMETER: "/akashic/database-url",
            AWS_SESSION_TOKEN: "token",
        },
        fn,
    );
    assert.equal(url, "postgres://ssm");
    assert.equal(
        calls[0].url,
        "http://localhost:2773/systemsmanager/parameters/get?name=%2Fakashic%2Fdatabase-url&withDecryption=true",
    );
    assert.equal(calls[0].headers["X-Aws-Parameters-Secrets-Token"], "token");
});

test("拡張機能のポートを変えられる", async () => {
    const { fn, calls } = fakeFetch(200, { Parameter: { Value: "x" } });
    await resolveDatabaseUrl(
        {
            DATABASE_URL_PARAMETER: "p",
            PARAMETERS_SECRETS_EXTENSION_HTTP_PORT: "9999",
        },
        fn,
    );
    assert.match(calls[0].url, /^http:\/\/localhost:9999\//);
});

test("取得に失敗したら例外にする", async () => {
    await assert.rejects(
        resolveDatabaseUrl(
            { DATABASE_URL_PARAMETER: "p" },
            fakeFetch(400, {}).fn,
        ),
    );
    await assert.rejects(
        resolveDatabaseUrl(
            { DATABASE_URL_PARAMETER: "p" },
            fakeFetch(200, { Parameter: {} }).fn,
        ),
    );
});
