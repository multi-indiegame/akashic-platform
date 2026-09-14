export const openapi = {
    openapi: "3.0.3",
    info: {
        title: "akashic-storage HTTP API (admin)",
        version: "0.1.0",
    },
    security: [{ InternalToken: [] }],
    paths: {
        "/join": {
            get: {
                summary: "Issue a passive viewer token for a play session",
                security: [{ InternalToken: [] }],
                parameters: [
                    {
                        name: "playId",
                        in: "query",
                        required: true,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description: "OK",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/PlayTokenResponse",
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
                    "422": {
                        description: "Unprocessable Entity",
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
        "/start": {
            get: {
                summary: "Start a play session on storage",
                security: [{ InternalToken: [] }],
                parameters: [
                    {
                        name: "playId",
                        in: "query",
                        required: true,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description: "OK",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/PlayTokenResponse",
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
                    "422": {
                        description: "Unprocessable Entity",
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
        "/end": {
            get: {
                summary: "End a play session",
                security: [{ InternalToken: [] }],
                parameters: [
                    {
                        name: "playId",
                        in: "query",
                        required: true,
                        schema: { type: "string" },
                    },
                    {
                        name: "reason",
                        in: "query",
                        required: false,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description: "OK",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/EndResponse",
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
                    "422": {
                        description: "Unprocessable Entity",
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
        "/kick": {
            get: {
                summary: "Revoke a play token and disconnect its sockets",
                security: [{ InternalToken: [] }],
                parameters: [
                    {
                        name: "playId",
                        in: "query",
                        required: true,
                        schema: { type: "string" },
                    },
                    {
                        name: "playToken",
                        in: "query",
                        required: true,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description:
                            "OK. skipped is true when the play has already ended",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/OkSkippedResponse",
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
                    "502": {
                        description: "Bad Gateway",
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
        "/send-event": {
            post: {
                summary:
                    "Inject an extension notification event into the playlog",
                security: [{ InternalToken: [] }],
                parameters: [
                    {
                        name: "playId",
                        in: "query",
                        required: true,
                        schema: { type: "string" },
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                $ref: "#/components/schemas/SendEventRequest",
                            },
                        },
                    },
                },
                responses: {
                    "200": {
                        description:
                            "OK. skipped is true when the play has already ended",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/OkSkippedResponse",
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
            PlayTokenResponse: {
                type: "object",
                required: ["playToken"],
                properties: {
                    playToken: { type: "string" },
                },
            },
            EndResponse: {
                type: "object",
                required: ["ok"],
                properties: {
                    ok: { type: "boolean" },
                },
            },
            OkSkippedResponse: {
                type: "object",
                required: ["ok"],
                properties: {
                    ok: { type: "boolean", enum: [true] },
                    skipped: { type: "boolean" },
                },
            },
            SendEventRequest: {
                type: "object",
                required: ["event"],
                properties: {
                    // playlog.Event。要素の型が位置ごとに異なるため items は指定しない
                    event: { type: "array", items: {} },
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
