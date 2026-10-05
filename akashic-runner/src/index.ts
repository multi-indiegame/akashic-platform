import process from "node:process";
import { installConsoleOverride } from "./logger";
import { ControlClient } from "./controlClient";
import { ExecManager } from "./execManager";
import { HttpServer } from "./httpServer";
import { Watchdog } from "./watchdog";

installConsoleOverride();

const serverUrl = process.env.SERVER_URL ?? "http://localhost:3032";
const serverRunnerApiToken = process.env.SERVER_RUNNER_API_TOKEN ?? "";
const runnerServerApiToken = process.env.RUNNER_SERVER_API_TOKEN ?? "";
const stallTimeoutMs = parseInt(process.env.STALL_TIMEOUT_MS ?? "30000");

const control = new ControlClient(serverUrl, serverRunnerApiToken);
const watchdog = new Watchdog(stallTimeoutMs);
const manager = new ExecManager(control, (playIds) =>
    watchdog.setPlays(playIds),
);
const http = new HttpServer({ manager, apiToken: runnerServerApiToken });

const exit = async () => {
    console.log("destroy akashic-runner forcibly");
    http.close();
    await manager.destroy();
    process.exit(0);
};
process.on("SIGINT", async () => await exit());
process.on("SIGTERM", async () => await exit());

const port = parseInt(process.env.PORT ?? "3034");
http.listen(port);
