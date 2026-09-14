# CHANGELOG

## 2.2.1

- Misc
  - `@multi-indiegame/akashic-player-ban` プラグイン対応のために `akashic-storage` への中継APIを追加

## 2.2.0

- Feature
  - 即時 BAN 用に webapp 認証の `/kick?playId&playToken` を追加し、storage admin の `/kick` へ転送する

## 2.1.2

- Fix
  - akashic-runner から content-log を分割して受信するよう修正

## 2.1.1

- Misc
  - `playlogClient-like` の更新に伴う再ビルド

## 2.1.0

- Feature
  - 部屋作成時に部屋チャット有効・無効設定を受け取れるよう修正

## 2.0.0

- Change
  - 環境変数名変更
    - `SERVER_API_TOKEN` -> `SERVER_WEBAPP_API_TOKEN`

- Refactor
  - アクティブインスタンス機能を `akashic-runner` に委譲

## 1.5.0

- Feature
  - ゲスト参加禁止部屋を作成できるように

## 1.4.1

- Improve
  - 5分間参加者がいなければ自動部屋終了

## 1.4.0

- Feature
  - トレース記録用設定追加

## 1.3.6

- Improve
  `playlogClient` の `maxPreservingTickSize` を設定する環境変数 (`MAX_PRESERVING_TICK_SIZE`) を追加。未設定時は `0`

## 1.3.5

- Misc
  - Update dependencies.

## 1.3.4

- Improve
  - HTTPレスポンス時、明示的に Content-Type を指定するよう修正

## 1.3.3

- Improve
  - `console.error` 出力の場合、スタックトレースを追加出力するよう修正

## 1.3.2

- Feature
  - プレイ終了時、プレイヤーからログ報告があった場合、ゲーム投稿主に通知するよう修正

## 1.3.1

- Feature
  - プレイのゲームログを S3 にアップロードする機能を追加
  - アクティブインスタンスが異常終了（`errorTrigger` でcatch）するか、プレイ中に `console.error` が出力された場合、通知レコードを作成するよう修正

## 1.3.0

- Feature
  - ユーザー投稿ゲームのログに PlayID, ContentID を埋め込む機能を追加

## 1.2.0

- Feature
  - 入室にキーワードが必要な限定部屋を作成する機能を追加

## 1.1.0

- Misc
  - `akashic-storage` の Socket.IO 接続先 URL 変更にともなう接続先変更

## 1.0.2

- Misc
  - `*.pem` をカレントディレクトリに配置するよう修正

## 1.0.1

- Misc
  - `*.pem` がある場合、コンテナに含めるように

## 1.0.0

公開
