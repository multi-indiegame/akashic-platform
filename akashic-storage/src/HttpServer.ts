import { Server, createServer } from "node:http";
import express from "express";
import cors from "cors";
import type { Event } from "@akashic/playlog";
import type {
    PlayEndReason,
    PlayExtendPayload,
} from "@yasshi2525/amflow-server-event-schema";
import { AMFlowServerManager } from "./AMFlowServerManager";
import { PlayManager } from "./PlayManager";

interface HttpServerParameterObject {
    basePath: string;
    amfManager: AMFlowServerManager;
    playManager: PlayManager;
    /**
     * if undefined or empty array, skip setting cors.
     */
    allowOrigins?: string[];
    adminApiToken: string;
}

export class HttpServer {
    _basePath: string;
    _amfManager: AMFlowServerManager;
    _playManager: PlayManager;
    _publicHttp: Server;
    _adminHttp: Server;
    _adminApiToken: string;

    constructor(param: HttpServerParameterObject) {
        this._basePath = param.basePath;
        this._amfManager = param.amfManager;
        this._playManager = param.playManager;
        if (!param.adminApiToken) {
            throw new Error("STORAGE_ADMIN_TOKEN is required");
        }
        this._adminApiToken = param.adminApiToken;
        const { publicHttp, adminHttp } = this._createHttp(param.allowOrigins);
        this._publicHttp = publicHttp;
        this._adminHttp = adminHttp;
    }

    listen(publicPort: number, adminPort: number) {
        this._publicHttp.listen(publicPort, () => {
            console.log(
                `start to listen public port ${publicPort} at ${this._basePath}`,
            );
        });
        this._adminHttp.listen(adminPort, () => {
            console.log(
                `start to listen admin port ${adminPort} at ${this._basePath}`,
            );
        });
    }

    close() {
        this._publicHttp.close();
        this._adminHttp.close();
    }

    getPublicHttp() {
        return this._publicHttp;
    }

    getAdminHttp() {
        return this._adminHttp;
    }

    _createHttp(allowOrigins: string[] | undefined) {
        const publicApp = express();
        publicApp.use(express.json());
        if (allowOrigins && allowOrigins.length > 0) {
            publicApp.use(
                cors({
                    origin: allowOrigins,
                }),
            );
        }
        const publicRouter = express.Router();
        publicApp.use(this._basePath, publicRouter);

        const adminApp = express();
        adminApp.use(express.json());
        adminApp.use((req, res, next) => {
            if (
                req.header("x-akashic-internal-token") !== this._adminApiToken
            ) {
                res.status(401).json({ ok: false, reason: "Unauthorized" });
                return;
            }
            next();
        });
        const adminRouter = express.Router();
        adminApp.use(this._basePath, adminRouter);

        const publicHttp = createServer(publicApp);
        const adminHttp = createServer(adminApp);

        adminRouter.get("/start", async (req, res) => {
            const playId = req.query.playId;
            if (!playId?.toString()) {
                res.status(400).json({ ok: false, reason: "MissingPlayId" });
            } else {
                try {
                    const server = this._playManager.start(playId.toString());
                    const playToken = await server.generateToken(true);
                    res.json({ playToken });
                } catch (err) {
                    res.status(422).json({
                        ok: false,
                        reason: "UnprocessableEntity",
                        message: `failed to start. (playId = "${playId.toString()}", cause = "${(err as Error).message}")`,
                    });
                }
            }
        });

        // 視聴者トークンの発行は admin に置く。public に晒すと、BAN された
        // 利用者が playId を指定して新しいトークンを取り直し、webapp の入室
        // ガードを迂回して再接続できてしまうため
        adminRouter.get("/join", async (req, res) => {
            const playId = req.query.playId;
            if (!playId?.toString()) {
                res.status(400).json({ ok: false, reason: "MissingPlayId" });
            } else {
                try {
                    const playToken = await this._amfManager
                        .getServer(playId.toString())
                        .generateToken(false);
                    res.json({ playToken });
                } catch (err) {
                    res.status(422).json({
                        ok: false,
                        reason: "UnprocessableEntity",
                        message: `failed to join. (playId = "${playId}", cause = "${(err as Error).message}")`,
                    });
                }
            }
        });

        publicRouter.get("/participants", (req, res) => {
            const playId = req.query.playId;
            if (!playId?.toString()) {
                res.status(400).json({ ok: false, reason: "MissingPlayId" });
            } else {
                try {
                    const participants = this._amfManager
                        .getServer(playId.toString())
                        .getParticipants();
                    res.json({ participants });
                } catch (err) {
                    res.status(422).json({
                        ok: false,
                        reason: "UnprocessableEntity",
                        message: `failed to get participants. (playId = "${playId}", cause = "${(err as Error).message}")`,
                    });
                }
            }
        });

        adminRouter.get("/end", async (req, res) => {
            const playId = req.query.playId;
            const reason = req.query.reason;
            if (!playId?.toString()) {
                res.status(400).json({ ok: false, reason: "MissingPlayId" });
            } else {
                try {
                    await this._playManager.end(
                        playId.toString(),
                        (reason?.toString() ??
                            "INTERNAL_ERROR") as PlayEndReason,
                    );
                    res.json({ ok: true });
                } catch (err) {
                    res.status(422).json({
                        ok: false,
                        reason: "UnprocessableEntity",
                        message: `failed to end. (playId = "${playId}", cause = "${(err as Error).message}")`,
                    });
                }
            }
        });

        adminRouter.get("/kick", async (req, res) => {
            const playId = req.query.playId;
            const playToken = req.query.playToken;
            if (!playId?.toString() || !playToken?.toString()) {
                res.status(400).json({ ok: false, reason: "InvalidParams" });
                return;
            }
            let server;
            try {
                server = this._amfManager.getServer(playId.toString());
            } catch (err) {
                // 部屋が既に終了していれば切断対象は存在しない。BAN は再入室
                // 拒否側 (webapp) で担保されるため、ここは skip 応答でよい
                console.warn(
                    `kick skipped (playId = "${playId}", cause = "${(err as Error).message}")`,
                );
                res.json({ ok: true, skipped: true });
                return;
            }
            try {
                await server.kick(playToken.toString());
                res.json({ ok: true });
            } catch (err) {
                // token 失効/切断の失敗は token が有効なまま残る。成功扱いに
                // すると webapp が再試行の控え (PlaySession) を消してしまうため
                // 非 2xx で返し、失敗を伝播させる
                console.warn(
                    `kick failed (playId = "${playId}", cause = "${(err as Error).message}")`,
                );
                res.status(502).json({
                    ok: false,
                    reason: "KickFailed",
                    message: `failed to kick. (playId = "${playId}", cause = "${(err as Error).message}")`,
                });
            }
        });

        // 拡張向けの通知イベントを playlog へ注入する。active インスタンス
        // (runner) が受けて tick に載せるため、全インスタンスが同一 tick で
        // 同一内容を受け取る。詳細は akashic-external-protocol の PROTOCOL.md
        adminRouter.post("/send-event", (req, res) => {
            const playId = req.query.playId;
            const { event } = req.body as { event?: Event };
            if (!playId?.toString() || !Array.isArray(event)) {
                res.status(400).json({ ok: false, reason: "InvalidParams" });
                return;
            }
            try {
                this._amfManager
                    .getServer(playId.toString())
                    .sendEvent(event as Event);
                res.json({ ok: true });
            } catch (err) {
                // 部屋が既に終了していれば届ける相手がいない。通知は best-effort
                // なので、kick と同じく skip 応答にする
                console.warn(
                    `send-event skipped (playId = "${playId}", cause = "${(err as Error).message}")`,
                );
                res.json({ ok: true, skipped: true });
            }
        });

        publicRouter.post("/extend", (req, res) => {
            const { playId, expiresAt, remainingMs, extendMs } = req.body as {
                playId?: string;
            } & Partial<PlayExtendPayload>;
            if (!playId?.toString()) {
                res.status(400).json({ ok: false, reason: "MissingPlayId" });
                return;
            }
            if (expiresAt == null || remainingMs == null || extendMs == null) {
                res.status(400).json({ ok: false, reason: "InvalidPayload" });
                return;
            }
            const payload: PlayExtendPayload = {
                expiresAt: expiresAt as number,
                remainingMs: remainingMs as number,
                extendMs: extendMs as number,
            };
            try {
                this._amfManager.broadcastPlayExtend(
                    playId.toString(),
                    payload,
                );
                res.json({ ok: true });
            } catch (err) {
                res.status(422).json({
                    ok: false,
                    reason: "UnprocessableEntity",
                    message: `failed to extend. (playId = "${playId}", cause = "${(err as Error).message}")`,
                });
            }
        });

        return { publicHttp, adminHttp };
    }
}
