import { Server } from "node:http";
import express, { Express } from "express";
import type { StartPlayRequest } from "@multi-indiegame/runner-ipc-schema";
import type { ExecManager } from "./execManager";

interface HttpServerParameterObject {
    manager: ExecManager;
    apiToken: string;
}

export class HttpServer {
    _manager: ExecManager;
    _app: Express;
    _server?: Server;
    _apiToken: string;

    constructor(param: HttpServerParameterObject) {
        this._manager = param.manager;
        if (!param.apiToken) {
            throw new Error("RUNNER_SERVER_API_TOKEN is required");
        }
        this._apiToken = param.apiToken;
        this._app = this._createHttp();
    }

    listen(port: number) {
        this._server = this._app.listen(port, (err) => {
            if (err) {
                console.error(err);
            } else {
                console.log(`akashic-runner listening on port ${port}`);
            }
        });
    }

    close() {
        this._server?.close();
    }

    _createHttp() {
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            if (req.header("x-akashic-internal-token") !== this._apiToken) {
                res.status(401).json({ ok: false, reason: "Unauthorized" });
                return;
            }
            next();
        });

        app.post("/plays", async (req, res) => {
            const body = req.body as Partial<StartPlayRequest>;
            if (
                body.playId == null ||
                !body.storagePublicUrl ||
                !body.playToken ||
                !body.contentUrl ||
                !body.assetBaseUrl ||
                !body.configurationUrl ||
                !body.playerId ||
                !body.playerName ||
                body.maxPreservingTickSize == null
            ) {
                res.status(400).json({ ok: false, reason: "BadRequest" });
                return;
            }
            try {
                await this._manager.start(body as StartPlayRequest);
                res.json({ ok: true });
            } catch (err) {
                res.status(500).json({
                    ok: false,
                    reason: "InternalError",
                    message: (err as Error).message,
                });
            }
        });

        app.post("/plays/:playId/stop", async (req, res) => {
            const playId = parseInt(req.params.playId);
            if (Number.isNaN(playId)) {
                res.status(400).json({ ok: false, reason: "BadRequest" });
                return;
            }
            try {
                const result = await this._manager.stop(playId);
                res.json(result);
            } catch (err) {
                res.status(500).json({
                    ok: false,
                    reason: "InternalError",
                    message: (err as Error).message,
                });
            }
        });

        return app;
    }
}
