import type { PlayInfo, SessionLike } from "@multi-indiegame/playlog-client";
import type * as PlaylogClient from "@multi-indiegame/playlog-client";
import type { SocketOptions } from "socket.io-client";
import { ProtocolType } from "./akashic-gameview";

interface ActiveSession {
    errorHandlers: ((err: Error) => void)[];
    refCount: number;
    session: SessionLike;
}

type SessionListener = (
    err: Error | null,
    session: SessionLike | null,
    usePrimaryChannel: boolean,
) => void;

export class SessionManager {
    _activeSessionTable: Record<string, ActiveSession | null>;
    _playlogClient: typeof PlaylogClient | null;
    _socketOpts: SocketOptions | null;

    constructor() {
        this._activeSessionTable = {};
        this._playlogClient = null;
        this._socketOpts = null;
    }

    isInitialized() {
        return !!this._playlogClient;
    }

    initialize(client: typeof PlaylogClient) {
        this._playlogClient = client;
    }

    setSocketOptions(opts: SocketOptions) {
        this._socketOpts = opts;
    }

    /**
     * @param protocol {@link ProtocolType}
     */
    getSession(
        url: string,
        protocol: number,
        info: PlayInfo,
        cb: SessionListener,
    ) {
        if (this._playlogClient) {
            const activeSession = this._activeSessionTable[url];
            if (activeSession) {
                activeSession.refCount++;
                setTimeout(() => {
                    cb(null, activeSession.session, false);
                }, 0);
            } else {
                const session = this._playlogClient.Session(url, {
                    socketType: this._playlogClient.Socket.Type.WebSocket,
                    validationData: info,
                    socketOpts: this._socketOpts,
                });
                session.on("error", (err) => {
                    const activeSession = this._activeSessionTable[url];
                    if (activeSession) {
                        for (const cb of activeSession.errorHandlers) {
                            cb(err);
                        }
                    }
                });
                session.open((err) => {
                    if (err) {
                        setTimeout(() => {
                            cb(err, null, true);
                        }, 0);
                    } else {
                        this._activeSessionTable[url] = {
                            session,
                            refCount: 1,
                            errorHandlers: [],
                        };
                        setTimeout(() => {
                            cb(null, session, true);
                        }, 0);
                    }
                });
            }
        } else {
            setTimeout(() => {
                cb(new Error("playlog-client not initialized"), null, true);
            });
        }
    }

    addErrorHandler(url: string, handler: (err: Error) => void) {
        this._activeSessionTable[url]?.errorHandlers.push(handler);
    }

    removeErrorHandler(url: string, handler: (err: Error) => void) {
        const activeSession = this._activeSessionTable[url];
        if (activeSession) {
            activeSession.errorHandlers = activeSession.errorHandlers.filter(
                (h) => h !== handler,
            );
        }
    }

    releaseSession(url: string) {
        const activeSession = this._activeSessionTable[url];
        if (activeSession) {
            if (--activeSession.refCount < 1) {
                activeSession.session.close(() => {});
                this._activeSessionTable[url] = null;
            }
        }
    }
}
