export const openapi = {
    openapi: "3.0.3",
    info: {
        title: "akashic-runner HTTP API",
        version: "0.1.0",
    },
    security: [{ InternalToken: [] }],
    paths: {
        "/plays": {
            post: {
                summary: "Start executing a play (called by akashic-server)",
                description:
                    "投稿スクリプトの実行を開始する。playToken は akashic-server が取得済みのものを渡す。",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                $ref: "#/components/schemas/StartPlayRequest",
                            },
                        },
                    },
                },
                responses: {
                    "200": {
                        description: "OK",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/OkResponse",
                                },
                            },
                        },
                    },
                    "400": {
                        description: "Bad Request",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ErrorResponse",
                                },
                            },
                        },
                    },
                    "401": {
                        description: "Unauthorized",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ErrorResponse",
                                },
                            },
                        },
                    },
                    "500": {
                        description: "Internal Server Error",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ErrorResponse",
                                },
                            },
                        },
                    },
                },
            },
        },
        "/plays/{playId}/stop": {
            post: {
                summary: "Stop executing a play (called by akashic-server)",
                description:
                    "実行中のプレイを停止する。冪等。停止時に観測した crashed / errorLogged を返す。",
                parameters: [
                    {
                        name: "playId",
                        in: "path",
                        required: true,
                        schema: { type: "integer", format: "int32" },
                    },
                ],
                responses: {
                    "200": {
                        description: "OK",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/StopPlayResponse",
                                },
                            },
                        },
                    },
                    "400": {
                        description: "Bad Request",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ErrorResponse",
                                },
                            },
                        },
                    },
                    "500": {
                        description: "Internal Server Error",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ErrorResponse",
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {
        securitySchemes: {
            InternalToken: {
                type: "apiKey",
                in: "header",
                name: "X-Akashic-Internal-Token",
            },
        },
        schemas: {
            StartPlayRequest: {
                type: "object",
                required: [
                    "playId",
                    "storagePublicUrl",
                    "playToken",
                    "contentUrl",
                    "assetBaseUrl",
                    "configurationUrl",
                    "playerId",
                    "playerName",
                    "maxPreservingTickSize",
                ],
                properties: {
                    playId: { type: "integer", format: "int32" },
                    storagePublicUrl: { type: "string", format: "uri" },
                    playToken: { type: "string" },
                    contentUrl: { type: "string", format: "uri" },
                    assetBaseUrl: { type: "string", format: "uri" },
                    configurationUrl: { type: "string", format: "uri" },
                    playerId: { type: "string" },
                    playerName: { type: "string" },
                    maxPreservingTickSize: { type: "integer", format: "int32" },
                    scoreboard: {
                        $ref: "#/components/schemas/ScoreboardParameters",
                    },
                },
            },
            ScoreboardParameters: {
                type: "object",
                description:
                    "記録を受け取るなら指定する。 指定したときだけ akashic-runner が投稿スクリプトに `g.game.external.scoreboard` を生やすので、 省略するとコンテンツ側の `isSupported()` は false になる。",
                properties: {
                    limits: { $ref: "#/components/schemas/ScoreboardLimits" },
                },
            },
            ScoreboardLimits: {
                type: "object",
                description:
                    "コンテンツに課す上限。 省略した項目は akashic-runner が使う拡張ライブラリの既定値になる。 上限を超えた値は記録されず、 akashic-runner が理由をログに残す。",
                properties: {
                    keysPerPlayer: {
                        type: "integer",
                        format: "int32",
                        description: "1 つの記録に持てるキーの数",
                    },
                    stringLength: {
                        type: "integer",
                        format: "int32",
                        description: "文字列の値の長さ",
                    },
                    playerIdLength: {
                        type: "integer",
                        format: "int32",
                        description: "in-game playerId の長さ",
                    },
                    subjectsPerPlay: {
                        type: "integer",
                        format: "int32",
                        description:
                            "1 プレイで記録を持てる相手の数 (プレイ自体の記録を含まない)",
                    },
                },
            },
            StopPlayResponse: {
                type: "object",
                required: ["ok", "crashed", "errorLogged"],
                properties: {
                    ok: { type: "boolean", enum: [true] },
                    crashed: { type: "boolean" },
                    errorLogged: { type: "boolean" },
                },
            },
            OkResponse: {
                type: "object",
                required: ["ok"],
                properties: {
                    ok: { type: "boolean", enum: [true] },
                },
            },
            ErrorResponse: {
                type: "object",
                required: ["ok", "reason"],
                properties: {
                    ok: { type: "boolean", enum: [false] },
                    reason: { type: "string" },
                    message: { type: "string" },
                },
            },
        },
    },
} as const;

export type OpenApiDocument = typeof openapi;
