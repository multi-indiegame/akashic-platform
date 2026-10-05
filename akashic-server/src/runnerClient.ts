import type {
    StartPlayRequest,
    StopPlayResponse,
} from "@multi-indiegame/runner-ipc-schema";

// WHY: runner は停止の中で記録とログを送り切るが、それぞれ期限を持つので
// これを超えて待つのは runner が応答しないときだけ
const STOP_TIMEOUT_MS = 60000;

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
            signal: AbortSignal.timeout(STOP_TIMEOUT_MS),
        });
        if (res.status !== 200) {
            throw new Error(
                `failed to stop play on runner (status = ${res.status}, cause = "${await res.text()}")`,
            );
        }
        return (await res.json()) as StopPlayResponse;
    }
}
