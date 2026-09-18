import type { GameDriver } from "@akashic/game-driver";
import type { Game, Scene } from "@akashic/akashic-engine";
import { AkashicGameView, GameContent } from "@multi-indiegame/agvw";

/**
 * {@link AkashicGameView#destroy} は Promise な gameDriver の終了を待たずに null リセットしてしまっている。
 * そこで安全に終了するよう上書きする
 */
export async function destroyAkashicGameView(view: AkashicGameView) {
    if (view.destroyed()) {
        return;
    }
    // GameDriver はスクリプトロードが終わらないと作成されない
    // GameDriver#destroy() を hook するために作成されるまで待機する。
    await waitUntilGameDriverReady(view);
    await waitUntilDestroyed(view);
    if (view._hasOwnGameViewShared) {
        if (!view._gameViewShared.destroyed()) {
            // 通常は stopGame() 内の _releasePlaylogClientAMFlow() が playlog
            // セッション(WebSocket)を閉じるが、これは GameDriver#initialize の
            // コールバック内にあり、切り離し検知で待たずに完了した場合や終了が
            // 完了しなかった場合は発火しない。GameViewSharedObject#destroy() は
            // sessionManager を null するだけでセッションを閉じないため、ここで
            // 明示的に閉じてリーク(サーバ側セッションの残留)を防ぐ。
            releasePlaylogSessions(view);
            view._gameViewShared.destroy();
        }
        view._hasOwnGameViewShared = false;
    }
    view._gameViewShared = null!;
    // NOTE: agvw 実装は作成した div 要素を削除しないので手動で削除している
    view._gameContentShared.gameViewElement.destroy();
    view._gameContentShared = null!;
}

async function waitUntilGameDriverReady(view: AkashicGameView) {
    await Promise.all(
        getGameContents(view).map(
            async (content) =>
                await new Promise<void>((resolve) => {
                    if (content._loader) {
                        resolve();
                    } else {
                        content.addContentLoadListener({
                            onLoad: () => {
                                resolve();
                            },
                        });
                    }
                }),
        ),
    );
}

function isLoadingScene(scene: Scene | undefined) {
    return (
        !!scene &&
        (scene === scene.game._defaultLoadingScene ||
            scene === scene.game.loadingScene)
    );
}

function isMainScene(scene: Scene | undefined) {
    return (
        !!scene &&
        scene !== scene.game._initialScene &&
        scene !== scene.game._defaultLoadingScene &&
        scene !== scene.game.loadingScene
    );
}

/**
 * スクリプトロード中にdestroyするとエラーが発生する。
 * そのため、エラーが発生しなくなるタイミングまで待つ。
 * ただし、デバッグモードの画面ロードのように短時間で2回ロードすると loadingScene から進まない。
 * そのため、エラーは発生するが、そのときは強制終了させる措置をとっている。
 */
function isPrepared(scene: Scene | undefined) {
    return isLoadingScene(scene) || isMainScene(scene);
}

async function waitUntilSceneLoad(game: Game) {
    await new Promise<void>((resolve) => {
        if (isPrepared(game.scene())) {
            resolve();
        } else {
            game._onSceneChange.add((scene) => {
                if (isPrepared(scene)) {
                    resolve();
                    return true;
                }
            });
        }
    });
}

/**
 * GameDriver は initialScene のセットアップが終わる前に destroy するとエラーが起きるので、待機
 */
async function waitUntilPrepare(driver: GameDriver) {
    await new Promise<void>((resolve) => {
        if (driver._game) {
            waitUntilSceneLoad(driver._game).then(() => resolve());
        } else {
            driver.gameCreatedTrigger.addOnce((game) => {
                waitUntilSceneLoad(game).then(() => resolve());
            });
        }
    });
}

async function waitUntilDestroyed(view: AkashicGameView) {
    await new Promise<void>((resolve) => {
        const contents = getGameContents(view);
        const alives = new Set<GameContent>(contents);
        hooksDestroy(
            contents,
            (driver) => waitUntilPrepare(driver),
            (content) => {
                alives.delete(content);
                if (alives.size === 0) {
                    resolve();
                }
            },
        );
        view.removeAllContents();
        // ゲームエンジンは iframe 内で動いており、終了処理(GameDriver#initialize/
        // destroy)はその iframe realm の Promise マイクロタスクに依存する。
        // React の再構成(PlayView のアンマウント)で iframe を含む親要素が
        // DOM から切り離されると、ブラウザによっては realm のマイクロタスクが
        // 破棄され、終了処理(driver.destroy の hook)が完了しない(Firefox で確認)。
        // この場合は待っても完了しないため、切り離しを検知したら待たずに完了とみなす。
        if (!isViewElementConnected(view)) {
            resolve();
        }
    });
}

/**
 * SessionManager が保持する playlog セッション(WebSocket)を明示的に閉じる。
 *
 * 通常は TrustedGameLoader._releasePlaylogClientAMFlow() 経由で閉じられるが、
 * 終了処理が完了しない経路では呼ばれないため、ここで直接 close する。
 */
function releasePlaylogSessions(view: AkashicGameView): void {
    const sessionManager = view._gameViewShared?.sessionManager as
        | {
              _activeSessionTable: Record<
                  string,
                  { session: { close(cb: (msg: string) => void): void } } | null
              >;
          }
        | undefined;
    const table = sessionManager?._activeSessionTable;
    if (!table) {
        return;
    }
    for (const url of Object.keys(table)) {
        const activeSession = table[url];
        if (activeSession) {
            try {
                activeSession.session.close(() => {});
            } catch (err) {
                console.debug(err);
            }
            table[url] = null;
        }
    }
}

/**
 * AkashicGameView の DOM 要素が document に接続されているかを返す。
 */
function isViewElementConnected(view: AkashicGameView): boolean {
    const element = (
        view._gameContentShared?.gameViewElement as unknown as {
            _htmlElement?: HTMLElement;
        }
    )?._htmlElement;
    return !!element && element.isConnected;
}

function getGameContents(view: AkashicGameView) {
    return Object.values(view._contents).filter(
        (content) => content instanceof GameContent,
    );
}

function hooksDestroy(
    contents: GameContent[],
    prepare: (driver: GameDriver) => Promise<void>,
    done: (content: GameContent) => void,
) {
    for (const content of contents) {
        content.getGameDriver()!.destroy = new Proxy(
            content.getGameDriver()!.destroy,
            {
                apply: async (target, thisArg) => {
                    await prepare(thisArg);
                    try {
                        await target.call(thisArg);
                    } catch (err) {
                        // デバッグモードの画面ロードのように短時間で2回ロードすると発生
                        console.debug(err);
                    }
                    done(content);
                },
            },
        );
    }
}
