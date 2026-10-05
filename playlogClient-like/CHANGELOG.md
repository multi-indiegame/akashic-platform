# CHANGELOG

## 2.0.1

### Patch Changes

- b06da70: storage との接続が切れたプレイの停止が返らない問題と、storage へつながらないときに起動が返らない問題を修正

## 2.0.0

- Breaking Change
  - 分割転送方式に対応
  - `transferStallTimeoutMs` を追加 (既定 60000ms)

## 1.2.1

- Misc
  - 安全性向上のためのビルドスクリプト改善

## 1.2.0

- Feature
  - Carrier 情報の注入処理追加 (トレーサビリティ強化)

## 1.1.1

- Misc
  - Update dependencies.

## 1.1.0

- Misc
  - Socket.IO 接続先がルートパスでない場合も接続できるよう改善

## 1.0.0

公開
