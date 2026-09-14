# CHANGELOG

## 2.3.2

- Improve
  - `./webapp`
    - ゲーム投稿/更新/削除・部屋を閉じる/延長する・お気に入りの堅牢性を向上

## 2.3.1

- Fix
  - `./webapp`
    - ゲーム投稿サイズ制限が効いていなかった問題を修正

- Improve
  - `./webapp`
    - ゲーム投稿サイズ上限、アイコン画像サイズ上限を表示

## 2.3.0

- Feature
  - ミュート機能を追加
    - `./webapp`
      - 特定の投稿者の伝言板・部屋チャットでの発言をミュートできる機能を追加
      - ミュートした相手が作成した部屋は部屋一覧に表示しない
      - サインインしていない場合は端末内でのみ設定が有効。
    - `./schema/persist`
      - ミュート機能用テーブルを追加
  - 通報・問い合わせ機能追加
    - `./webapp`
      - 伝言板・部屋チャットの投稿、部屋、ユーザーを通報できる機能を追加
        - SES 設定時は運営へ通報メールを通知
      - 運営者への問い合わせフォーム追加
    - `./schema/persist`
      - 関連テーブル追加
  - BAN機能を追加
    - `./webapp`
      - 自分の部屋の特定の参加者を即時退室させる機能を追加
      - サインイン時は今後作成する部屋に対しても入室禁止措置継続
    - `./akashic-storage`
      - BANされた人の即時切断・再認証拒否を追加
    - `./akashic-server`
      - `webapp` から `akashic-server` へのBAN情報を伝達
    - `./schema/persist`
      - 関連テーブル追加

## 2.2.1

- Fix
  - 長期間出力されなかったログが content-log に出力されない (#114)
    - `./akashic-runner`
      - 分割送信するよう修正
    - `./akashic-server`
      - 分割受信するよう修正

## 2.2.0

- Improve
  - `TickList`, `StartPoint` の分割送信・多重送信防止によるOOM防止
    - `./akashic-storage`
      - Valkey からの多重取得防止、分割して応答
    - `./playlogClient-like`
      - 受信された結果分割の再構成。
    - `./schema/amflow`
      - 分割転送のためのイベント・型を追加
    - 上記ライブラリ更新による再ビルド
      - `./webapp`
      - `./akashic-server`
      - `./akashic-runner`

## 2.1.0

- Feature
  - 部屋チャット機能を追加 (#53)
    - `./webapp`
      - 部屋チャット画面を追加。部屋作成時に有効・無効設定可能
    - `./akashic-server`
      - 部屋終了時にチャット履歴をクリーンナップ
    - `./manager-server`
      - 手動部屋チャット履歴削除機能を追加
    - `./schema/persist`
      - 部屋チャット関係テーブルを追加

## 2.0.1

- Improve
  - `./webapp`
    - 部屋強制終了時、部屋を閉じるガードを表示しないよう改善

## 2.0.0

- Change
  - 環境変数名変更
    - `./webapp`
    - `./akashic-server`
      - `SERVER_API_TOKEN` -> `SERVER_WEBAPP_API_TOKEN`

- Refactor
  - アクティブインスタンスを安全な環境で実行するようモジュールを再構成
    - `./akashic-runner`
      - ゲーム本処理を担当
    - `./akashic-server`
      - プレイ制御を担当
    - `./schema/runner-ipc`
      - 両者間のスキーマ定義

## 1.8.0

- Feature
  - 伝言板機能を追加 (#87)
    - `./schema/persist`
      - 伝言板のデータを保存するテーブルを追加
    - `./webapp`
      - トップページに伝言板を表示

## 1.7.5

- Fix
  - `./webapp`
    - スキップ中の操作禁止ガードが効かなくなっていた問題を修正

## 1.7.4

- Improve
  - `./webapp`
    - 部屋を閉じるときに同じ設定で部屋を作り治せるよう改善 (#52)

## 1.7.3

- Improve
  - `./webapp`
    - 非サインイン時のランディングページを改善 (#59)

## 1.7.2

- Improve
  - `./akashic-storage`
    - playlog をメモリ上に保管する最低限の期間を設定できるように

## 1.7.1

- Improve
  - `./webapp`
    - 部屋作成バーに属性（限定、ゲスト参加禁止）を表示

## 1.7.0

- Feature
  - ゲスト参加禁止部屋を作成できるように (#90)
    - `./schema/persist`
      - サインイン要求フラグを追加
    - `./akashic-server`
      - ゲスト参加禁止部屋を作成できるように
    - `./webapp`
      - UIを更新

## 1.6.9

- Misc
  - `./agvw-like`
  - `./playlogClient-like`
  - `./webapp`
    - コードの安全性を向上

## 1.6.8

- Feature
  - `./webapp`
    - 全画面モード追加 (#88)

## 1.6.7

- Improve
  - `./akashic-storage`
    - Valkey 書き込み間隔を削減 (環境変数 `CHUNK_SIZE`) (#89)

## 1.6.6

- Improve
  - `./webapp`
    - プレイ終了直後、ユーザー部屋画面にエラーが瞬間的に表示される問題を改善 (#85)

## 1.6.5

- Fix
  - `./webapp`
    - ゲームコンテナ破棄時にクリーンナップ処理が確実に終了するよう修正 (#63 ※再修正)

## 1.6.4

- Improve
  - `./webapp`
    - 部屋主退室時、他に参加者がいなければ閉室を案内 (#36)
  - `./akashic-server`
    - 5分間参加者がいなければ自動部屋終了 (#36)

## 1.6.3

- Improve
  - `./webapp`
    - 投稿コンテンツS3アップロード時に Content-Type を設定 (#63)

## 1.6.2

- Improve
  - `./webapp`
    - 自分の部屋でゲームを起動した際、画面上部に自動スクロールするよう改善 (#80)

## 1.6.1

- Feature
  - `./webapp`
    - トレーサビリティ強化 ブラウザ連携部分実装 (#77)

## 1.6.0

- Feature
  - トレーサビリティ強化 (#77)
    - `./schema/amflow/common`
    - `./schema/amflow/server`
    - `./schema/amflow/client`
    - `./playlogClient-like`
    - `./agvw-like`
    - `./akashic-storage`
    - `./akashic-server`
    - `./webapp`

## 1.5.0

- Feature
  - ユーザー部屋機能を追加 (#31)
    - `./schema/persist`
      - ユーザーハンドルフィールドを追加
    - `./webapp`
      - ユーザー部屋表示画面を追加

## 1.4.19

- Improve
  - `./akashic-storage`
    - 書き込み遅延によるラグ対策 (#74)
      - Valkey への書き込みを非同期化
      - 直近Tick情報をオンメモリでバッファリングする機能を追加
        - バッファ数: 環境変数 `MEMORY_TICK_BUFFER_SIZE` (デフォルト値: `300`)

## 1.4.18

- Improve
  - `./akashic-server`
    - `playlogClient` の `maxPreservingTickSize` を設定する環境変数 (`MAX_PRESERVING_TICK_SIZE`) を追加。未設定時は `0`
  - `./webapp`
    - プレイ残り時間が少なくなった際に通知する機能を追加 (#35)
    - xs, sm におけるメニューバーレイアウトを改善

## 1.4.17

- Improve
  - `./webapp-static`
    - メンテナンス用画面追加

## 1.4.16

- Misc
  - Update dependencies.

## 1.4.15

- Improve
  - よく遊ぶゲームを部屋作成時に優先的に表示する「お気に入り機能」を追加 (#41)
    - `./schema/persist`
      - お気に入り情報を保存するよう修正
    - `./webapp`
      - お気に入り追加機能を追加

## 1.4.14

- Improve
  - 古い Content Log, Client Log ファイルを削除する運用ができるよう改善 (#62)
    - `./schema/persist`
      - ログファイルの削除フラグを追加
    - `./webapp`
      - ファイルが削除された際の表示を追加
    - `./manager-server`
      - ログを削除するエンドポイント `/content-logs/delete` を追加

## 1.4.13

- Bug Fix
  - `./webapp`
    - 非サインイン時、部屋を終了しても同時作成可能部屋数がリセットされない問題を修正

- Feature
  - `./webapp`
    - 前回フォーム入力した下記の値を引き継ぐ機能を追加（同一端末の場合のみ引き継ぎ可能） (#33)
      - 作成する部屋の名前
      - 作成する部屋の公開・限定設定
      - プレイ中のゲーム音量
      - ゲーム中の表示プレイヤー名（非サインイン時）

- Improve
  - `./webapp`
    - 環境変数 `DRAIN_REFRESH_INTERVAL` でドレイン間隔を変更できるよう修正

## 1.4.12

- Improve
  - HTTPレスポンス時、明示的に Content-Type を指定するよう修正 (#18)
    - `./akashic-server`
    - `./akashic-storage`
    - `./webapp`

## 1.4.11

- Improve
  - エラー発生時のアラート表示場所をボタン上部に統一 (#24)
  - `./webapp`
    - ゲームのプレイ数表記をカンマ区切りに変更

## 1.4.10

- Bug Fix
  - `./agvw-like`
    - `SessionManager` のエラーハンドラに引き渡す関数の指定誤りを修正

## 1.4.9

- Improve
  - `./webapp`
    - 終了した部屋を表示した場合、部屋情報・ゲーム情報を表示するよう改善 (#13)

## 1.4.8

- Improve
  - `./webapp`
    - スマートフォンでゲーム操作中にブラウザデフォルト動作が干渉しないよう修正 (`1.4.5` の再修正)

## 1.4.7

- Improve
  - `./webapp`
    - スマートフォンでゲーム画面が画面内に収まるよう修正 (#12)
    - スマートフォンでゲーム操作中にブラウザデフォルト動作が干渉して、画面が選択中にならないよう修正 (#38)

## 1.4.6

- Bug Fix
  - `./akashic-storage`
    - broadcast する Tick の順序が subscribe 順と一致しない場合がある問題を修正 (#57)

## 1.4.5

- Bug Fix
  - `./webapp`
    - スマートフォンで X のシェアボタンが機能しないボタンを修正 (#11)
    - プレイヤーによるログ送信時、捕捉した例外の詳細情報が展開されない問題を修正

## 1.4.4

- Improve
  - `./webapp`
    - ゲーム一覧から部屋を作成しやすく動線を改善 (#9)
    - ゲーム説明欄中のURLはリンクとして表示するよう改善 (#17)

## 1.4.3

- Improve
  - `./webapp`
    - プレイヤーによるログ送信時、 `console.error` または `Error` が報告された場合、スタックトレースを含めるよう修正
  - `./akashic-server`
    - `console.error` 出力の場合、スタックトレースを追加出力するよう修正

## 1.4.2

- Feature
  - プレイヤーが自身のプレイ中ログをゲーム投稿主に報告できる機能を追加
    - `./akashic-server`
      - プレイ終了時、投稿主に通知する機能を追加
    - `./webapp`
      - ログ送信・表示機能を追加
    - `./schema/persist`
      - プレイヤーからのログ送信履歴を記録するテーブルを追加

## 1.4.1

- Feature
  - 投稿ゲームの部屋のログをダウンロードする機能を追加
    - `./akashic-server`
      - ログのアップロード機能を追加
    - `./webapp`
      - ログのダウンロード画面を追加
  - 投稿ゲームの異常終了時・エラーログ出力時、通知する機能を追加
    - `./schema/persist`
      - エラーの有無を記録するフィールドを追加

## 1.4.0

- Feature
  - `./akashic-server`
    - ユーザー投稿ゲームのログに PlayID, ContentID を埋め込む機能を追加

## 1.3.5

- Feature
  - 入室にキーワード入力を求める限定部屋機能を追加
    - `./webapp`
      - 限定部屋入室機能を追加
    - `./akashic-server`
      - 限定部屋を作成する機能を追加
    - `./schema/persist`
      - 限定部屋機能用フィールド追加

## 1.3.4

- Improve
  - `./akashic-storage`
    - Valkey Server への再接続設定により接続安定性を向上

## 1.3.3

- Misc
  - `./webapp`
    - 実況可否の表記を分かりやすく改善 (#29)

## 1.3.2

- Bug Fix
  - `./akashic-storage`
    - Event 書き込み遅延により、イベントがないものとして応答してしまう問題を修正

## 1.3.1

- Bug Fix
  - `./akashic-storage`
    - Event 情報が異なるノードに振り分けられてしまう問題を修正 (#34)

## 1.3.0

- Feature
  - `./webapp`
    - ゲスト状態の場合同時に作成できる部屋数に上限を設定できるよう修正

- Improve
  - `./webapp`
    - ゲスト状態の場合は部屋一覧でなく参加方法をガイドするよう修正

## 1.2.4

- Improve
  - `./akashic-storage`
    - 部屋を削除するとき、 Valkey Server へ負荷やブロックをかけないクエリに変更
    - `GlideClusterClientConfiguration.requestTimeout` を変更できるように修正

## 1.2.3

- Bug Fix
  - `./akashic-storage`
    - 同一tickに複数のEventがある場合、TickListの取得結果に欠損が生じる問題を修正
  - `./agvw-like`
    - AMFlowProxy 作成時、イベントハンドラが登録されない問題を修正

## 1.2.2

- Feature
  - `./webapp`
    - [`@akashic-extension/coe`](https://github.com/akashic-games/coe) を使用するゲームの実行に対応

- Bug Fix
  - `./webapp`
    - `S3_KEY_PREFIX` 指定時、ゲーム更新（アイコン更新なし）に失敗する問題を修正

- Misc
  - `./webapp`
    - ゲームアイコンが更新される度にURLがユニークになるよう修正 (#14)
  - `./agvw-like`
    - `GameContent` の `argument` を `any` に修正

## 1.2.1

- Misc
  - `./webapp`
    - カスタムフッターレイアウト改善

## 1.2.0

- Feature
  - `./webapp`
  - `./manager-server`
    - ドレイン機能追加

## 1.1.4

- Misc
  - `./webapp`
    - カスタムフッター追加

## 1.1.3

- Misc
  - `./webapp`
    - `1.1.1`, `1.1.2` の変更をロールバック

## ~~1.1.2~~

- ~~Misc~~
  - ~~`./webapp`~~
    - ~~ゲーム投稿・更新処理についても、署名付きURLを取得する方式に変更~~

## ~~1.1.1~~

- ~~Misc~~
  - ~~`./webapp`~~
    - ~~ファイルアップロード時、署名付きURLを取得する方式に変更~~

## 1.1.0

- Feature
  - `./webapp`
    - プレイ画面のスクリーンショット共有機能を追加 (#4)
    - Xに部屋のURLを投稿する機能を追加 (#4)

- Misc
  - `./webapp`
    - ゲーム一覧レイアウトの改善
    - Socket.IO 接続先 URL 変更にともなう接続先変更
    - S3 Bucket 格納先のキープレフィックス `S3_KEY_PREFIX` を追加
  - `./akashic-storage`
    - ルートパス以外でもリクエストを受け付ける `BASE_PATH` を追加
    - Socket.IO 接続受付先を `BASE_PATH/socket.io` に変更
  - `./akashic-server`
    - Socket.IO 接続先 URL 変更にともなう接続先変更
  - `./playlogClient-like`
    - Socket.IO 接続先がルートパスでない場合も接続できるよう改善
  - other
    - Docker Compose で起動停止を繰り返すと Valkey Cluster の起動が不安定になる問題を修正

## 1.0.9

- Feature
  - `./webapp`
    - プレイ中の音量調整機能を追加

- Misc
  - `./webapp`
    - ヘルプページ追加
    - ゲーム説明文セル/ボックスの改行ルール改善
    - フッターレイアウト改善
  - other
    - Docker Compose で起動停止を繰り返すと Valkey Cluster の起動が不安定になる問題を修正

## 1.0.8

- Misc
  - `./webapp`
    - 利用規約・プライバシーポリシー追加 (#5)
    - スマートフォン環境での視認性を改善 (#8)

## 1.0.7

- Bug Fix
  - `./webapp`
    - DOMアクセスするコンテンツがニコ生と同等の動作をするよう修正
  - other
    - Docker Compose で起動停止を繰り返すと Valkey Cluster の起動が不安定になる問題を修正

## 1.0.6

- Misc
  - `./akashic-storage`
    - Amazon ElastiCache に接続できるよう修正

## 1.0.5

- Misc
  - `./akashic-storage`
    - `GlideClientConfiguration.inflightRequestsLimit` を変更できるように修正

## 1.0.4

- Bug Fix
  - `./webapp`
    - ライセンスファイル情報が表示できない問題を修正

## 1.0.3

- Bug Fix
  - Twitter でサインインできない問題を修正

## 1.0.2

- Misc
  - `./akashic-server`
  - `./webapp`
    - `*.pem` をカレントディレクトリに配置するよう修正

## 1.0.1

- Misc
  - `./akashic-server`
  - `./webapp`
  - `./schema/persist`
    - `*.pem` がある場合、コンテナに含めるように

## 1.0.0

公開
