import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGameId, parseSearchParams } from "./params.ts";

test("既定値", () => {
    assert.deepEqual(parseSearchParams({}), {
        q: undefined,
        supported: undefined,
        sort: "new",
        page: 0,
        limit: 20,
    });
});

test("supported が空文字なら何にも対応していないとみなす", () => {
    assert.deepEqual(parseSearchParams({ supported: "" })?.supported, []);
});

test("supported の空要素と前後の空白を除く", () => {
    assert.deepEqual(
        parseSearchParams({ supported: " coe, ,send," })?.supported,
        ["coe", "send"],
    );
});

test("空白だけの q は指定なしとみなす", () => {
    assert.equal(parseSearchParams({ q: "  " })?.q, undefined);
});

test("範囲外・不正な値は弾く", () => {
    for (const query of [
        { sort: "old" },
        { limit: "0" },
        { limit: "51" },
        { limit: "1.5" },
        { page: "-1" },
        { page: "1001" },
        { q: "a".repeat(101) },
        { supported: Array.from({ length: 51 }, (_, i) => `p${i}`).join() },
    ]) {
        assert.equal(
            parseSearchParams(query),
            undefined,
            JSON.stringify(query),
        );
    }
});

test("ゲーム ID", () => {
    assert.equal(parseGameId("1"), 1);
    assert.equal(parseGameId("2147483647"), 2147483647);
    for (const value of ["0", "01", "-1", "1.0", "abc", "2147483648"]) {
        assert.equal(parseGameId(value), undefined, value);
    }
});
