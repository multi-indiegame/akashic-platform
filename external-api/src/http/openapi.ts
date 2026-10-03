const description = `
Akashic Platform に投稿されたゲームを、外部のプラットフォームで起動するための読み取り専用 API です。

## 対象となるゲーム

投稿者が「外部プラットフォームでの起動」を許可したゲームだけを返します。許可が取り消されたゲームや削除されたゲームは、検索に出なくなり、詳細と \`contents.json\` は \`404\` になります。

## 起動の流れ

1. \`GET /v1/games\` でゲームを探します。
2. 起動のたびに \`contentsJsonUrl\` (\`GET /v1/games/{gameId}/contents.json\`) を取得し、ビューアーへ渡します。
   - \`contents.json\` は常に最新バージョンを指します。\`contentId\` を控えて古いバージョンを起動し続けないでください。
   - 投稿者が許可を取り消した場合に起動できなくなるよう、取得した \`contents.json\` は応答のキャッシュ期間を超えて使い回さないでください。
3. \`contents.json\` の \`engine_urls\` は空配列です。Akashic Engine と playlog client は、\`game.json\` の \`environment["sandbox-runtime"]\` を見て受け入れ側で用意してください。

ゲームのデータ (\`game.json\` やアセット) は、\`content_url\` / \`asset_base_url\` から直接読み込みます。ブラウザから読み込むには、後述の Origin の登録が必要です。

## 拡張プラグイン

ゲームが使う拡張プラグイン (\`game.json\` の \`environment.external\` など) を \`externals\` で返します。

- \`required: true\`: このプラグインがない実行基盤ではゲームが動きません。対応していない場合は起動しないでください。
- \`required: false\`: ゲームがプラグインの有無で処理を切り替えます。対応していなくても起動できます。

必須かどうかは投稿者の申告によります。検索の \`supported\` に対応しているプラグインを渡すと、起動できるゲームだけに絞り込めます。

## 利用の登録

ブラウザから本 API とゲームのデータを読み込むには、受け入れ側の Origin を CORS で許可する必要があります。[お問い合わせ](https://multi-indiegame.net/contact/) から Origin をお知らせください。

## キャッシュとレート制限

- 応答は 60 秒キャッシュできます (\`Cache-Control: public, max-age=60\`)。許可の取り消しや投稿者名の変更は、最大 60 秒遅れて反映されます。
- リクエストが多すぎる場合は \`429\` を返します。時間をおいて再度リクエストしてください。

## エラー

成否は HTTP ステータスで表します。エラー時の本文は \`{ "reason": "..." }\` です (\`429\` を除く)。
`.trim();

const errorResponse = (desc: string) => ({
    description: desc,
    content: {
        "application/json": {
            schema: {
                $ref: "#/components/schemas/ErrorResponse",
            },
        },
    },
});

const tooManyRequestsResponse = {
    description: "リクエストが多すぎる",
    content: {
        "application/json": {
            schema: {
                $ref: "#/components/schemas/TooManyRequestsResponse",
            },
        },
    },
};

const cacheControlHeader = {
    "Cache-Control": {
        description: "`public, max-age=60`",
        schema: { type: "string" },
    },
};

const gameIdParameter = {
    name: "gameId",
    in: "path",
    required: true,
    description: "ゲームの ID",
    schema: { type: "integer", minimum: 1 },
};

export const openapi = {
    openapi: "3.0.3",
    info: {
        title: "外部プラットフォーム向け API",
        version: "1.0.0",
        description,
    },
    security: [],
    tags: [
        {
            name: "games",
            description: "ゲームの検索と起動",
        },
    ],
    paths: {
        "/v1/games": {
            get: {
                tags: ["games"],
                operationId: "searchGames",
                summary: "ゲームを検索する",
                parameters: [
                    {
                        name: "q",
                        in: "query",
                        required: false,
                        description:
                            "タイトル・説明の部分一致 (大文字小文字を区別しない)",
                        schema: { type: "string" },
                    },
                    {
                        name: "supported",
                        in: "query",
                        required: false,
                        description:
                            "受け入れ側が対応している拡張プラグイン名のカンマ区切り。必須のプラグインがすべてこの中にあるゲームに絞り込む。省略するとプラグインで絞り込まない。空文字は「何にも対応していない」とみなし、必須のプラグインがないゲームだけを返す",
                        schema: { type: "string" },
                        example: "coe,send",
                    },
                    {
                        name: "sort",
                        in: "query",
                        required: false,
                        description:
                            "`new`: 投稿日の新しい順、`updated`: 最新バージョンの投稿日の新しい順、`popular`: プレイ回数の多い順",
                        schema: {
                            type: "string",
                            enum: ["new", "updated", "popular"],
                            default: "new",
                        },
                    },
                    {
                        name: "page",
                        in: "query",
                        required: false,
                        description: "ページ番号 (0 始まり)",
                        schema: { type: "integer", minimum: 0, default: 0 },
                    },
                    {
                        name: "limit",
                        in: "query",
                        required: false,
                        description: "1 ページあたりの件数",
                        schema: {
                            type: "integer",
                            minimum: 1,
                            maximum: 50,
                            default: 20,
                        },
                    },
                ],
                responses: {
                    "200": {
                        description: "OK",
                        headers: cacheControlHeader,
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/GameListResponse",
                                },
                            },
                        },
                    },
                    "400": errorResponse("パラメータが不正"),
                    "429": tooManyRequestsResponse,
                },
            },
        },
        "/v1/games/{gameId}": {
            get: {
                tags: ["games"],
                operationId: "getGame",
                summary: "ゲームの詳細を取得する",
                parameters: [gameIdParameter],
                responses: {
                    "200": {
                        description: "OK",
                        headers: cacheControlHeader,
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/Game",
                                },
                            },
                        },
                    },
                    "400": errorResponse("パラメータが不正"),
                    "404": errorResponse(
                        "ゲームが存在しない、または外部プラットフォームでの起動が許可されていない",
                    ),
                    "429": tooManyRequestsResponse,
                },
            },
        },
        "/v1/games/{gameId}/contents.json": {
            get: {
                tags: ["games"],
                operationId: "getContentsJson",
                summary: "ゲームを起動するための contents.json を取得する",
                description:
                    "最新バージョンの contents.json を返す。起動のたびに取得し、ビューアーへ渡すこと。",
                parameters: [gameIdParameter],
                responses: {
                    "200": {
                        description: "OK",
                        headers: cacheControlHeader,
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ContentsJson",
                                },
                            },
                        },
                    },
                    "400": errorResponse("パラメータが不正"),
                    "404": errorResponse(
                        "ゲームが存在しない、または外部プラットフォームでの起動が許可されていない",
                    ),
                    "429": tooManyRequestsResponse,
                },
            },
        },
    },
    components: {
        schemas: {
            GameListResponse: {
                type: "object",
                required: ["items", "page", "limit", "hasNext"],
                properties: {
                    items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Game" },
                    },
                    page: { type: "integer", example: 0 },
                    limit: { type: "integer", example: 20 },
                    hasNext: {
                        type: "boolean",
                        description: "次のページがあるか",
                    },
                },
            },
            Game: {
                type: "object",
                required: [
                    "id",
                    "title",
                    "description",
                    "credit",
                    "iconUrl",
                    "pageUrl",
                    "publisher",
                    "contentId",
                    "contentsJsonUrl",
                    "licenseUrl",
                    "externals",
                    "playCount",
                    "createdAt",
                    "updatedAt",
                ],
                properties: {
                    id: {
                        type: "integer",
                        description: "ゲームの ID",
                        example: 123,
                    },
                    title: { type: "string", example: "ゲームのタイトル" },
                    description: {
                        type: "string",
                        description: "説明文 (プレーンテキスト)",
                    },
                    credit: {
                        type: "string",
                        description:
                            "素材などのクレジット (プレーンテキスト)。無い場合は空文字",
                    },
                    iconUrl: {
                        type: "string",
                        format: "uri",
                        description: "ゲームのアイコン画像",
                    },
                    pageUrl: {
                        type: "string",
                        format: "uri",
                        description: "Akashic Platform 上のゲームのページ",
                        example: "https://akashic.example.com/game/123/",
                    },
                    publisher: {
                        $ref: "#/components/schemas/Publisher",
                    },
                    contentId: {
                        type: "integer",
                        description:
                            "最新バージョンの ID。ゲームを更新すると変わる",
                        example: 456,
                    },
                    contentsJsonUrl: {
                        type: "string",
                        format: "uri",
                        description:
                            "`GET /v1/games/{gameId}/contents.json` の URL",
                    },
                    licenseUrl: {
                        type: "string",
                        format: "uri",
                        description:
                            "ゲームが同梱するライブラリのライセンス表記 (`library_license.txt`)。同梱していないゲームでは `404` になる",
                    },
                    externals: {
                        type: "array",
                        description: "最新バージョンが使う拡張プラグイン",
                        items: {
                            $ref: "#/components/schemas/External",
                        },
                    },
                    playCount: {
                        type: "integer",
                        description: "Akashic Platform 上でのプレイ回数",
                        example: 42,
                    },
                    createdAt: {
                        type: "string",
                        format: "date-time",
                        description: "ゲームの投稿日時",
                    },
                    updatedAt: {
                        type: "string",
                        format: "date-time",
                        description: "最新バージョンの投稿日時",
                    },
                },
            },
            Publisher: {
                type: "object",
                required: ["id", "name"],
                properties: {
                    id: { type: "string", description: "投稿者の ID" },
                    name: { type: "string", description: "投稿者名" },
                },
            },
            External: {
                type: "object",
                required: ["name", "required"],
                properties: {
                    name: {
                        type: "string",
                        description: "拡張プラグイン名",
                        example: "coe",
                    },
                    required: {
                        type: "boolean",
                        description:
                            "このプラグインがない実行基盤ではゲームが動かないか (投稿者の申告)",
                    },
                },
            },
            ContentsJson: {
                type: "object",
                description: "Akashic のビューアーが読み込む contents.json",
                required: [
                    "content_id",
                    "content_url",
                    "asset_base_url",
                    "engine_urls",
                    "external",
                    "untrusted",
                ],
                properties: {
                    content_id: {
                        type: "integer",
                        description: "最新バージョンの ID",
                        example: 456,
                    },
                    content_url: {
                        type: "string",
                        format: "uri",
                        description: "`game.json` の URL",
                    },
                    asset_base_url: {
                        type: "string",
                        format: "uri",
                        description: "アセットの基点となる URL",
                    },
                    engine_urls: {
                        type: "array",
                        items: { type: "string" },
                        maxItems: 0,
                        description:
                            "常に空配列。エンジンは受け入れ側で用意する",
                    },
                    external: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "使用する拡張プラグイン名 (必須・任意を問わない)",
                        example: ["coe", "scoreboard"],
                    },
                    untrusted: {
                        type: "boolean",
                        description: "常に `false`",
                        example: false,
                    },
                },
            },
            ErrorResponse: {
                type: "object",
                required: ["reason"],
                properties: {
                    reason: {
                        type: "string",
                        enum: ["InvalidParams", "NotFound"],
                    },
                },
            },
            TooManyRequestsResponse: {
                type: "object",
                description: "API Gateway が返す本文",
                properties: {
                    message: { type: "string", example: "Too Many Requests" },
                },
            },
        },
    },
};
