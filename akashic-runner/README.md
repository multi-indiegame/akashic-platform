# akashic-runner

安全な環境でアクティブインスタンスとしてふるまいます。

playToken は `akashic-server` が取得済みのものを受け取ります。
アクティブインスタンスの実行時ログは `akashic-server` に転送します。
スクリプトローディングは `akashic-server` が代理取得します。

投稿スクリプトはプレイごとに専用の worker thread で動かします。
worker が `PLAY_STALL_TIMEOUT_MS` (既定 15 秒) 応答しないときや、ヒープと外部メモリの合計が `PLAY_MAX_HEAP_MB` (既定 512 MB) を超えたとき、異常終了したときは、そのプレイだけを打ち切り、理由を content-log に残します。
