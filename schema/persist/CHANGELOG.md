# CHANGELOG

## 1.14.0

### Minor Changes

- 35ae604: feat: スコアボードの記録を受け取り、同意と突き合わせて歴代へ反映する

  - ゲームごとの統計ページ (歴代・直近1ヶ月・月別) と、投稿者による見せ方・称号条件の設定
  - 遊んだ人のマイページ統計、称号、共有ページ

## 1.13.1

- Improve
  - `Ban` の同一論理BAN 重複登録を防止

## 1.13.0

- Feature
  - BAN 機能として `Ban` テーブルと `BanOrigin` を追加
  - 即時 BAN 用に `PlaySession` テーブル（発行した playToken の記録）を追加

## 1.12.0

- Feature
  - 通報機能として `Report` テーブルを追加
  - 問い合わせ機能として `ContactMessage` テーブルを追加

## 1.11.0

- Feature
  - ミュート機能として `Mute` テーブルを追加

## 1.10.0

- Feature
  - 部屋チャット機能として `PlayChatMessage` テーブルを追加
  - `Play` に `chatEnabled` を追加

## 1.9.0

- Feature
  - 伝言板機能として `BoardMessage` テーブルを追加

## 1.8.0

- Feature
  - `Play` に `requireSignIn` を追加

## 1.7.0

- Feature
  - `User` に `handle` を追加

## 1.6.1

- Misc
  - Update dependencies.

## 1.6.0

- Feature
  - お気に入り機能として `Favorite` テーブルを追加

## 1.5.0

- Feature
  - `Play` にログ削除日時フィールド (`logDeletedAt`) を追加

## 1.4.0

- Feature
  - `ClientLogRecord` を追加

## 1.2.0, 1.3.0

- Feature
  - `Play` にログアップロードおよびエラー有無フィールド追加

## 1.1.0

- Feature
  - `Play` に限定部屋機能用フィールドを追加

## 1.0.2

- Bug Fix
  - `User`.`email` を Optional に

## 1.0.1

- Misc
  - `*.pem` がある場合、コンテナに含めるように

## 1.0.0

公開
