import type {
    StartPlayRequest,
    StopPlayResponse,
} from "@multi-indiegame/runner-ipc-schema";

export class RunnerClient {
    _baseUrl: string;
    _token: string;

    constructor(baseUrl: string, token: string) {
        this._baseUrl = baseUrl;
        this._token = token;
    }

    async startPlay(req: StartPlayRequest) {
        const res = await fetch(`${this._baseUrl}/plays`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-akashic-internal-token": this._token,
            },
            body: JSON.stringify(req),
        });
        if (res.status !== 200) {
            throw new Error(
                `failed to start play on runner (status = ${res.status}, cause = "${await res.text()}")`,
            );
        }
    }

    async stopPlay(playId: number) {
        const res = await fetch(`${this._baseUrl}/plays/${playId}/stop`, {
            method: "POST",
            headers: { "x-akashic-internal-token": this._token },
        });
        if (res.status !== 200) {
            console.warn(
                `failed to stop play on runner (playId = "${playId}", status = ${res.status})`,
            );
            return {
                ok: true,
                crashed: false,
                errorLogged: false,
            } as StopPlayResponse;
        }
        return (await res.json()) as StopPlayResponse;
    }
}
