import type { AMFlow } from "@akashic/amflow";
import type * as PlaylogClient from "@multi-indiegame/playlog-client";
import { ErrorFactory } from "./Error";
import { GameViewSharedObject } from "./SharedObject";
import {
    AcquirePlaylogClientAMFlowInfo,
    TrustedGameLoaderBase,
    TrustedGameLoaderBaseParameterObject,
} from "./TrustedGameLoaderBase";
import { EngineConfig } from "./GameContent";

interface TrustedGameLoaderParameterObject extends TrustedGameLoaderBaseParameterObject {
    shared: GameViewSharedObject;
}

export class TrustedGameLoader extends TrustedGameLoaderBase {
    _shared: GameViewSharedObject;
    _onSessionManagerError_bound: (err: Error) => void;

    constructor(param: TrustedGameLoaderParameterObject) {
        super(param);
        this._shared = param.shared;
        this._onSessionManagerError_bound =
            this._onSessionManagerError.bind(this);
    }

    _getAdditionalScripts(engineConfig: EngineConfig): string[] {
        return engineConfig.external
            .map((external) => this._shared.pluginManager.find(external))
            .filter((plugin) => plugin?.scriptUrls)
            .reduce((scripts, plugin) => {
                scripts.push(...plugin!.scriptUrls!);
                return scripts;
            }, [] as string[]);
    }

    _loadScripts(
        globalObject: Window,
        scriptUrls: string[],
        cb: (err: Error | null) => void,
    ) {
        this._shared.scriptManager.appendScripts(globalObject, scriptUrls, cb);
    }

    _initializeSessionManagerIfNeeded(playlogClient: typeof PlaylogClient) {
        if (!this._shared.sessionManager.isInitialized()) {
            this._shared.sessionManager.initialize(playlogClient);
        }
    }

    _acquirePlaylogClientAMFlow(
        info: AcquirePlaylogClientAMFlowInfo,
        cb: (err: Error | null, client: AMFlow | null) => void,
    ) {
        this._shared.sessionManager.getSession(
            info.playlogServerUrl,
            info.protocol,
            { playId: info.playId, token: info.playToken },
            (err, session, usePrimaryChannel) => {
                if (err) {
                    cb(err, null);
                } else {
                    this._shared.sessionManager.addErrorHandler(
                        info.playlogServerUrl,
                        this._onSessionManagerError_bound,
                    );
                    session!.createClient(
                        {
                            usePrimaryChannel,
                        },
                        cb,
                    );
                }
            },
        );
    }

    _releasePlaylogClientAMFlow() {
        this._shared.sessionManager.removeErrorHandler(
            this._playlogServerUrl,
            this._onSessionManagerError_bound,
        );
        this._shared.sessionManager.releaseSession(this._playlogServerUrl);
        // NOTE: stopGame() で呼ばれるのでここで null にして問題なし
        this._onSessionManagerError_bound = null!;
    }

    _onSessionManagerError(err: Error) {
        // NOTE: _param は start() で代入済み
        this._param!.errorHandler(ErrorFactory.createPlaylogError(err));
    }
}
