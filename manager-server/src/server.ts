import { Server } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import express from "express";
import { Express, NextFunction, Request, Response } from "express";
import { prisma } from "@multi-indiegame/persist-schema";
import { deleteClientLogs, deleteContentLog } from "./s3";

const WEBAPP_URL = process.env.WEBAPP_URL ?? "http://localhost:3000";
const hmacSecret = process.env.HMAC_SECRET;

if (!hmacSecret) {
    throw new Error("HMAC_SECRET is required");
}

function createDrainSignature(rawBody: string) {
    const timestamp = Date.now().toString();
    const requestId = randomUUID();
    const signature = createHmac("sha256", hmacSecret!)
        .update(`${timestamp}.${rawBody}`)
        .digest("hex");
    return { timestamp, requestId, signature };
}

async function postDrainToWebapp(body: { enabled: boolean; reason?: string }) {
    const rawBody = JSON.stringify(body);
    const { timestamp, requestId, signature } = createDrainSignature(rawBody);
    const response = await fetch(`${WEBAPP_URL}/api/internal/drain`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-drain-timestamp": timestamp,
            "x-drain-id": requestId,
            "x-drain-signature": signature,
        },
        body: rawBody,
    });
    const text = await response.text();
    try {
        return {
            status: response.status,
            data: JSON.parse(text),
        };
    } catch (err) {
        console.warn(`failed to parse response`, text, err);
        return {
            status: response.status,
            data: { raw: text },
        };
    }
}

export class HttpServer {
    _app: Express;
    _server?: Server;

    constructor() {
        this._app = this._createHttp();
    }

    listen(port: number) {
        this._server = this._app.listen(port, (err) => {
            if (err) {
                console.error(err);
            } else {
                console.log(`start to listen port ${port}`);
            }
        });
    }

    close() {
        if (this._server) {
            this._server.close();
        }
    }

    _createHttp() {
        const app = express();
        app.use(
            express.json({
                limit: "16kb",
            }),
        );

        app.get("/health", (_req: Request, res: Response) => {
            res.set("Cache-Control", "no-store");
            res.json({ ok: true });
        });

        app.get("/drain", async (req: Request, res: Response) => {
            const reason = req.query.reason?.toString();
            try {
                const result = await postDrainToWebapp({
                    enabled: true,
                    reason,
                });
                res.status(result.status).json({
                    ok: result.status === 200,
                    forwarded: true,
                    webapp: result.data,
                });
                return;
            } catch (err) {
                res.status(502).json({
                    ok: false,
                    reason: "ForwardFailed",
                    message: (err as Error).message,
                });
                return;
            }
        });

        app.get("/content-logs/delete", async (req: Request, res: Response) => {
            const retentionDays = Number(req.query.retentionDays ?? 30);
            const includeErrored = req.query.includeErrored === "true";

            if (!Number.isInteger(retentionDays) || retentionDays < 1) {
                res.status(400).json({
                    ok: false,
                    reason: "InvalidParams",
                    message: "retentionDays must be a positive integer",
                });
                return;
            }

            const cutoff = new Date(
                Date.now() - retentionDays * 24 * 60 * 60 * 1000,
            );

            try {
                const candidates = await prisma.play.findMany({
                    where: {
                        isActive: false,
                        logUploadedAt: {
                            not: null,
                        },
                        logDeletedAt: null,
                        endedAt: {
                            lt: cutoff,
                        },
                        ...(!includeErrored
                            ? {
                                  crashed: false,
                                  errorLogged: false,
                              }
                            : {}),
                    },
                    select: {
                        id: true,
                        contentId: true,
                    },
                });

                let targets = candidates;
                if (!includeErrored && candidates.length > 0) {
                    const clientLoggedPlayIds = await prisma.clientLogRecord
                        .findMany({
                            where: {
                                playId: {
                                    in: candidates.map((p) => p.id),
                                },
                            },
                            select: {
                                playId: true,
                            },
                            distinct: ["playId"],
                        })
                        .then((rows) => new Set(rows.map((r) => r.playId)));
                    targets = candidates.filter(
                        (p) => !clientLoggedPlayIds.has(p.id),
                    );
                }

                const deletedAt = new Date();
                let succeeded = 0;
                let failed = 0;

                for (const play of targets) {
                    try {
                        await deleteContentLog(play.contentId, play.id);
                        await deleteClientLogs(play.contentId, play.id);
                        await prisma.play.update({
                            where: {
                                id: play.id,
                            },
                            data: {
                                logDeletedAt: deletedAt,
                            },
                        });
                        succeeded++;
                    } catch (err) {
                        console.warn(
                            `failed to delete logs (playId = ${play.id})`,
                            err,
                        );
                        failed++;
                    }
                }

                res.json({
                    ok: true,
                    retentionDays,
                    includeErrored,
                    cutoff: cutoff.toISOString(),
                    total: targets.length,
                    succeeded,
                    failed,
                });
            } catch (err) {
                res.status(500).json({
                    ok: false,
                    reason: "InternalError",
                    message: (err as Error).message,
                });
            }
        });

        app.get("/play-chats/delete", async (_req: Request, res: Response) => {
            try {
                const { count } = await prisma.playChatMessage.deleteMany({
                    where: {
                        play: {
                            isActive: false,
                        },
                    },
                });
                res.json({ ok: true, deleted: count });
            } catch (err) {
                res.status(500).json({
                    ok: false,
                    reason: "InternalError",
                    message: (err as Error).message,
                });
            }
        });

        app.get(
            "/score-records/delete",
            async (req: Request, res: Response) => {
                const retentionDays = Number(
                    req.query.retentionDays ??
                        process.env.SCORE_RAW_RETENTION_DAYS ??
                        90,
                );
                if (!Number.isInteger(retentionDays) || retentionDays < 1) {
                    res.status(400).json({
                        ok: false,
                        reason: "InvalidParams",
                        message: "retentionDays must be a positive integer",
                    });
                    return;
                }
                const cutoff = new Date(
                    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
                );

                try {
                    // WHY: 生レコードを消してよいのは、その月の集計を凍結し終えた
                    // 分だけ。凍結していない月を消すと、月別の統計を二度と組み立て
                    // られなくなる
                    const archives = await prisma.scoreboardArchive.findMany({
                        select: { gameId: true, month: true },
                    });
                    let deleted = 0;
                    const months: string[] = [];
                    for (const archive of archives) {
                        const [year, mon] = archive.month
                            .split("-")
                            .map(Number);
                        const from = new Date(Date.UTC(year, mon - 1, 1));
                        const to = new Date(Date.UTC(year, mon, 1));
                        if (to > cutoff) {
                            continue;
                        }
                        const { count } = await prisma.scoreRecord.deleteMany({
                            where: {
                                gameId: archive.gameId,
                                endedAt: { gte: from, lt: to },
                            },
                        });
                        if (count > 0) {
                            deleted += count;
                            months.push(`${archive.gameId}:${archive.month}`);
                        }
                    }
                    res.json({
                        ok: true,
                        retentionDays,
                        cutoff: cutoff.toISOString(),
                        deleted,
                        months,
                    });
                } catch (err) {
                    res.status(500).json({
                        ok: false,
                        reason: "InternalError",
                        message: (err as Error).message,
                    });
                }
            },
        );

        app.get(
            "/score-archives/delete",
            async (req: Request, res: Response) => {
                const retentionMonths = Number(
                    req.query.retentionMonths ??
                        process.env.SCORE_ARCHIVE_RETENTION_MONTHS ??
                        48,
                );
                if (!Number.isInteger(retentionMonths) || retentionMonths < 1) {
                    res.status(400).json({
                        ok: false,
                        reason: "InvalidParams",
                        message: "retentionMonths must be a positive integer",
                    });
                    return;
                }
                const now = new Date();
                const cutoffDate = new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth() - retentionMonths,
                        1,
                    ),
                );
                const cutoff = `${cutoffDate.getUTCFullYear()}-${String(cutoffDate.getUTCMonth() + 1).padStart(2, "0")}`;

                try {
                    // WHY: S3 の実体はライフサイクルポリシーで消えるので、
                    // ここでは月の一覧に出さないよう DB のレコードだけ消す
                    const { count } = await prisma.scoreboardArchive.deleteMany(
                        {
                            where: { month: { lt: cutoff } },
                        },
                    );
                    res.json({
                        ok: true,
                        retentionMonths,
                        cutoff,
                        deleted: count,
                    });
                } catch (err) {
                    res.status(500).json({
                        ok: false,
                        reason: "InternalError",
                        message: (err as Error).message,
                    });
                }
            },
        );

        app.use((req: Request, res: Response) => {
            res.status(404).json({
                ok: false,
                reason: "NotFound",
            });
        });

        app.use(
            (
                err: Error & { type?: string; status?: number },
                _req: Request,
                res: Response,
                _next: NextFunction,
            ) => {
                if (err.type === "entity.too.large" || err.status === 413) {
                    res.status(413).json({
                        ok: false,
                        reason: "PayloadTooLarge",
                    });
                    return;
                }
                res.status(400).json({
                    ok: false,
                    reason: "InvalidJson",
                });
            },
        );

        return app;
    }
}
