# CHANGELOG

## 1.2.0

### Minor Changes

- 94e5123: 投稿スクリプトをプレイごとの worker thread で動かし、無限ループや異常終了が起きたときはそのプレイだけを打ち切るようにした

## 1.1.1

### Patch Changes

- b06da70: storage との接続が切れたプレイの停止が返らない問題と、storage へつながらないときに起動が返らない問題を修正
- b06da70: 投稿スクリプトの無限ループなどでメインスレッドが止まったとき、プロセスを強制終了して再起動に任せるようにした
- Updated dependencies [b06da70]
  - @multi-indiegame/playlog-client@2.0.1

## 1.1.0

### Minor Changes

- 35ae604: feat: スコアボードの記録を受け取り、同意と突き合わせて歴代へ反映する

  - ゲームごとの統計ページ (歴代・直近1ヶ月・月別) と、投稿者による見せ方・称号条件の設定
  - 遊んだ人のマイページ統計、称号、共有ページ

### Patch Changes

- Updated dependencies [35ae604]
  - @multi-indiegame/runner-ipc-schema@1.1.0

## 1.0.2

- Fix
  - content-log を分割して akashic-server に送信するよう修正

## 1.0.1

- Misc
  - `playlogClient-like` の更新に伴う再ビルド

## 1.0.0

公開
