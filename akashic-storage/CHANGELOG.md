# CHANGELOG

## 2.1.1

- Misc
  - `@multi-indiegame/akashic-player-ban` プラグイン対応のためにプレイヤーID検証処理追加

## 2.1.0

- Feature
  - 即時 BAN 用の admin API `/kick?playId&playToken` を追加。対象 playToken の socket を切断し、token を失効させて再認証を拒否する

## 2.0.0

- Improve
  - `getTickList`, `getStartPoint` をレスポンスする際、データを分割送信することでメモリ使用量を節約
    - Valkey からの Tick 取得を一括からチャンク単位に
    - チャンク送信後、クライアントからのackを待ってから次のチャンクの送出を開始する（送信待ちデータ量を 1 チャンクに限定）
    - StartPoint は Valkey 上の JSON を parse せずそのまま分割して送出
    - 切断・`amf:close`・`amf:cancelTransfer` で進行中の転送を破棄
  - 環境変数 `TRANSFER_ACK_TIMEOUT_MS` / `STARTPOINT_CHUNK_SIZE` を追加

## 1.2.2

- Improve
  - playlog をメモリ上に保管する最低限の期間を設定できるように (環境変数 `CHUNK_MEMORY_RETENTION_MS`)

## 1.2.1

- Improve
  - Valkey 書き込み間隔を削減 (環境変数 `CHUNK_SIZE`)

## 1.2.0

- Feature
  - トレーサビリティ強化のための埋め込みポイントを追加

## 1.1.9

- Improve
  - Valkey への書き込みを非同期化
  - 直近Tick情報をオンメモリでバッファリングする機能を追加
    - バッファ数: 環境変数 `MEMORY_TICK_BUFFER_SIZE` (デフォルト値: `300`)

## 1.1.8

- Misc
  - Update dependencies.

## 1.1.7

- Improve
  - HTTPレスポンス時、明示的に Content-Type を指定するよう修正

## 1.1.6

- Bug Fix
  - broadcast する Tick の順序が subscribe 順と一致しない場合がある問題を修正

## 1.1.5

- Improve
  - Valkey Server への再接続設定により接続安定性を向上

## 1.1.4

- Bug Fix
  - Event 書き込み遅延により、イベントがないものとして応答してしまう問題を修正

## 1.1.3

- Bug Fix
  - Event 情報が異なるノードに振り分けられてしまう問題を修正

## 1.1.2

- Improve
  - 部屋を削除するとき、 Valkey Server へ負荷やブロックをかけないクエリに変更
  - 環境変数 `REQUEST_TIMEOUT` で `requestTimeout` を変更できるように修正

## 1.1.1

- Bug Fix
  - 同一tickに複数のEventがある場合、 `getTickList` が不適切な範囲のTick情報を返却する問題を修正

## 1.1.0

- Misc
  - ルートパス以外でもリクエストを受け付ける `BASE_PATH` を追加
  - Socket.IO 接続受付先を `BASE_PATH/socket.io` に変更

## 1.0.2

- Misc
  - Valkey Cluster mode の元で動作するよう修正

## 1.0.1

- Misc
  - 環境変数 `INFLIGHT_REQUEST_LIMIT` で `inflightRequestsLimit` を変更できるように修正

## 1.0.0

公開
