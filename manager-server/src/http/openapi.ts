export const openapi = {
    openapi: "3.0.3",
    info: {
        title: "manager-server HTTP API",
        version: "0.1.0",
    },
    paths: {
        "/health": {
            get: {
                summary: "Health check",
                responses: {
                    "200": {
                        description: "OK",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/HealthResponse",
                                },
                            },
                        },
                    },
                },
            },
        },
        "/content-logs/delete": {
            get: {
                summary: "Delete old play logs from S3 and mark them in DB",
                parameters: [
                    {
                        name: "retentionDays",
                        minimum: 1,
                        default: 30,
                        description:
                            "Logs older than this many days are deleted",
                        in: "query",
                        required: false,
                        schema: { type: "string" },
                    },
                    {
                        name: "includeErrored",
                        default: false,
                        description:
                            "If true, also delete logs from plays with errors or client log reports",
                        in: "query",
                        required: false,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description:
                            "Deletion completed (check failed count for partial errors)",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/LogDeleteResponse",
                                },
                            },
                        },
                    },
                    "400": {
                        description: "Invalid parameters",
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
        "/score-records/delete": {
            get: {
                summary: "Delete archived raw score records from DB",
                parameters: [
                    {
                        name: "retentionDays",
                        minimum: 1,
                        default: 90,
                        description:
                            "Records older than this many days are deleted, but only for months already archived",
                        in: "query",
                        required: false,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description: "Deletion completed",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ScoreRecordDeleteResponse",
                                },
                            },
                        },
                    },
                    "400": {
                        description: "Invalid parameters",
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
        "/drain": {
            get: {
                summary: "Forward a signed drain request to webapp",
                parameters: [
                    {
                        name: "reason",
                        description: "notice for users",
                        in: "query",
                        required: false,
                        schema: { type: "string" },
                    },
                ],
                responses: {
                    "200": {
                        description: "Forwarded and applied",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ForwardResponse",
                                },
                            },
                        },
                    },
                    "400": {
                        description: "Invalid JSON or invalid request body",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ErrorResponse",
                                },
                            },
                        },
                    },
                    "413": {
                        description: "Payload too large",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ErrorResponse",
                                },
                            },
                        },
                    },
                    "502": {
                        description: "Failed to forward request to webapp",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ForwardFailedResponse",
                                },
                            },
                        },
                    },
                    default: {
                        description: "Forwarded response from webapp",
                        content: {
                            "application/json": {
                                schema: {
                                    $ref: "#/components/schemas/ForwardResponse",
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            LogDeleteResponse: {
                type: "object",
                required: [
                    "ok",
                    "retentionDays",
                    "includeErrored",
                    "cutoff",
                    "total",
                    "succeeded",
                    "failed",
                ],
                properties: {
                    ok: { type: "boolean", enum: [true] },
                    retentionDays: { type: "integer" },
                    includeErrored: { type: "boolean" },
                    cutoff: { type: "string", format: "date-time" },
                    total: {
                        type: "integer",
                        description: "Number of plays targeted for deletion",
                    },
                    succeeded: { type: "integer" },
                    failed: { type: "integer" },
                },
            },
            ScoreRecordDeleteResponse: {
                type: "object",
                required: [
                    "ok",
                    "retentionDays",
                    "cutoff",
                    "deleted",
                    "months",
                ],
                properties: {
                    ok: { type: "boolean", enum: [true] },
                    retentionDays: { type: "integer" },
                    cutoff: { type: "string", format: "date-time" },
                    deleted: {
                        type: "integer",
                        description: "Number of score records deleted",
                    },
                    months: {
                        type: "array",
                        description: "Pruned months as `<gameId>:<YYYY-MM>`",
                        items: { type: "string" },
                    },
                },
            },
            HealthResponse: {
                type: "object",
                required: ["ok"],
                properties: {
                    ok: { type: "boolean" },
                },
            },
            DrainRequest: {
                type: "object",
                required: ["enabled"],
                properties: {
                    enabled: { type: "boolean" },
                    reason: { type: "string" },
                },
            },
            ForwardResponse: {
                type: "object",
                required: ["ok", "forwarded", "webapp"],
                properties: {
                    ok: { type: "boolean" },
                    forwarded: { type: "boolean" },
                    webapp: {
                        description: "Raw JSON response from webapp endpoint",
                        oneOf: [
                            { type: "object", additionalProperties: true },
                            { type: "array", items: {} },
                            { type: "string" },
                            { type: "number" },
                            { type: "boolean" },
                            { type: "null" },
                        ],
                    },
                },
            },
            ErrorResponse: {
                type: "object",
                required: ["ok", "reason"],
                properties: {
                    ok: { type: "boolean", enum: [false] },
                    reason: { type: "string" },
                },
            },
            ForwardFailedResponse: {
                type: "object",
                required: ["ok", "reason", "message"],
                properties: {
                    ok: { type: "boolean", enum: [false] },
                    reason: { type: "string", enum: ["ForwardFailed"] },
                    message: { type: "string" },
                },
            },
        },
    },
} as const;

export type OpenApiDocument = typeof openapi;
