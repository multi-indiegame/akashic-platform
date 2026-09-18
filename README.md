# Akashic Platform

[dwango](https://dwango.co.jp/) 提供の [Akashic Engine](https://akashic-games.github.io/) のマルチプレイモードに準拠したゲームをプレイ可能にする Web サービス実装です。

- 用語
  - ゲーム: ユーザーが投稿したもの
  - プレイ: ゲームを起動したもの

- メイン機能
  - ゲーム投稿
  - プレイ開始
  - プレイ参加

- 機能要件
  - ユーザー登録
  - ゲーム一覧
  - プレイ一覧
  - ユーザー名取得プラグインの代替実装

- 実行可能なゲーム
  - `environment.sandbox-runtime`: `"3"`
  - `environment.nicolive.supportedModes`: `"multi_admission"` または `"multi"`
    - 旧仕様の `environment.niconico` も受け付ける (`nicolive` と両方ある場合は `niconico` を無視)
  - `environment.external`:
    - 対応
      - `"coeLimited"`
      - `"coe"`
      - `"send"`
      - [`"playerBan"`](https://github.com/multi-indiegame/akashic-player-ban)
    - 未対応
      - `@akashic-extension/instance-storage`

## 構成図

本プラットフォームは以下の4つのプロセスから構成されます。

- akashic-server
  各プレイのライフサイクルを制御する。
- akashic-runner
  各プレイの実処理を進める。
- akashic-storage
  実行中の全プレイ情報を保管する。
- webapp
  各種操作できるWebアプリケーション

![アーキテクチャ図](./architecture.png)

Web API 仕様: https://multi-indiegame.github.io/akashic-platform/

## リポジトリ構成

### webapp

ゲームプラットフォームとして機能する Web アプリケーション 実装

### webapp-static

静的 Web ページファイル。メンテナンス画面などの Web アプリケーション停止時に表示する画面用

### schema

クライアント・サーバー両者で必要なスキーマ定義置き場

### agvw-like

ビューアーの基盤モジュールです。[`@akashic/agvw`](https://github.com/akashic-games/agvw) を元に制作しています。

### playlogClient-like

[`@akashic/playlog-client`](https://github.com/akashic-games/akashic-system/tree/main/packages/playlog-client) の独自実装です。本リポジトリ開発当初、当該モジュールのソースが公開されていなかったため独自に実装しました。

### akashic-server

アクティブインスタンスの起動制御を行うサーバー。 `akashic-runner` を制御します。

### akashic-runner

プレイごとにアクティブインスタンスを起動するサーバー。
`akashic serve` がクライアントと密結合なため独自に実装します。
安全な環境で実行するため、隔離した環境でも動作できるように実装されています。

### akashic-storage

プレイ時の実行時情報の保存と配信機能。
`akashic serve` のメモリ効率が悪いため独自に実装します。

### manager-server

サービスメンテナンス機能を制御する管理サーバー。

## インストール方法・使い方

### Docker Compose (推奨)

#### 前提ソフトウェア

- Docker

#### セットアップ

`.env.example` の記述を参考に `.env` を配置してください。

`AUTH_SECRET` には下記を参考に 32byte の base64 文字列を指定してください。

##### 設定例：

```sh
openssl rand -base64 33
<abcd...>
```

`.env`

```sh
AUTH_SECRET="<abcd...>"
```

#### 実行方法

```sh
docker compose up
```

`http://localhost:3000` にアクセスするとゲームで遊ぶことができます。

### スタンドアロンサーバー

#### 前提ソフトウェア

- Node.js
- PostgreSQL: ユーザー・ゲーム情報・プレイ情報の保管
- Valkey: ゲーム実行時情報の保管
- Minio: コンテンツデータ（投稿ゲームデータ）の保管

Valkey の JavaScript Client の制約により、Windows OS上では動作しません。(WSL上ならOK)

#### インストール

```sh
npm install
```

#### セットアップ

##### schema/persist, akashic-storage, akashic-server, akashic-runner, manager-server

`.env.example` の記述を参考に `.env` を配置してください。

##### webapp

`.env.example` の記述を参考に `.env` を配置してください。

```sh
npx -w ./webapp auth secret
```

`.env.local` が作成されます。

#### 実行方法

```sh
npm run run -w ./akashic-storage &
npm run run -w ./akashic-server &
npm run run -w ./akashic-runner &
npm run dev -w ./webapp &
```

必要に応じて管理サーバーを起動させてください。

```sh
npm run run -w ./manager-server
```

設定変更は `./schema/persist`, `./akashic-storage`, `./akashic-server`, `./akashic-runner`, `./webapp`, `./manager-server` 配下に `.env` を置くことでできます。 `.env.example` を参考にしてください。

`http://localhost:3000` にアクセスするとゲームで遊ぶことができます。

### ホスティング時の留意点

- 下記のポートはクライアントに公開してください。
  - `minio` の `9000` 番ポート
  - `akashic-storage` の `PUBLIC_PORT` (`3031`)
  - `webapp` の `PORT` (`3000`)
- セキュリティのため、下記の事項を考慮してください。
  - クライアントが上記以外のポートに到達できないよう、ファイアウォールなどで適切にアクセス制限してください。
  - 意図しないリクエストを許可しないため各種認証用のトークンには推測不可能な文字列を設定してください。
  - `akashic-runner` プロセス上ではユーザースクリプトが実行されるため、アウトバウンド通信を制限するなど、環境を隔離するよう考慮してください。

## LICENSE

- Source code
  - [MIT License](./LICENSE)

- Rendered Image
  - [`./webapp/public/image/icon.png`](./webapp/public/image/icon.png), [`./webapp/public/favicon.ico`](./webapp/public/favicon.ico)
    - Copyright (c) 2015-present Ionic (http://ionic.io/)
    - Licensed under [The MIT License](./LICENSE_icon)

> [!IMPORTANT]
>
> [`./agvw-like`](./agvw-like/) は DWANGO Co., Ltd. が [MIT License](https://github.com/akashic-games/agvw/blob/main/LICENSE) で公開している [`@akashic/agvw`](https://github.com/akashic-games/agvw) をリバースエンジニアリングにして作成したものです。
> 詳細は [`./agvw-like/README.md`](./agvw-like/README.md) を参照してください。

## Author

- multi-indiegame ([Contact](https://multi-indiegame.net/contact/))
