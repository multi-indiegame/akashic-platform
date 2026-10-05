# external-api

外部プラットフォーム向けの読み取り専用 API です。API Gateway (HTTP API) + AWS Lambda で動かし、DB を直接読みます。

- API 仕様: `src/http/openapi.ts` (Swagger UI で公開)

## 開発

```sh
npm run build -w @multi-indiegame/persist-schema
npm run bundle -w @multi-indiegame/external-api # bundle/index.js を出力
npm test -w @multi-indiegame/external-api
```

## AWS の構成

IaC は持たず、コンソールで作る。

### Lambda

- ランタイム: Node.js 22.x、ハンドラ: `index.handler`
- VPC: DB に届くサブネット・セキュリティグループに置く。DB 側のセキュリティグループで、Lambda からの 5432 を許可する
- 予約済み同時実行数: 5 程度。1 実行環境あたり DB 接続は 1 本なので、これが DB への最大接続数になる
- 環境変数

| 名前                      | 内容                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | webapp と同じ DB。証明書は zip に同梱する `postgres.pem` を `sslrootcert=/var/task/postgres.pem` で指す |
| `PUBLIC_BASE_URL`         | webapp の公開 URL (ゲームページの URL に使う)                                                           |
| `PUBLIC_CONTENT_BASE_URL` | コンテンツ配信の公開 URL (webapp と同じ値)                                                              |
| `PUBLIC_API_BASE_URL`     | 本 API の公開 URL。省略時はリクエストのホスト名から組み立てる                                           |

### API Gateway (HTTP API)

- ルート: `GET /v1/{proxy+}` を Lambda に統合する (パスの振り分けは Lambda で行う)
- ステージ: `$default` (パスにステージ名を含めないため)
- CORS: 外部プラットフォームの Origin を許可する。メソッドは `GET`。S3 のコンテンツの CORS と同じ一覧にする
- スロットリング: ステージの既定ルートに上限 (例: 20 req/s、バースト 40) を設定する
- 独自ドメインを当てる

## デプロイ

GitHub Actions の「Deploy External API」を手動で実行する。DB の migration を当てた後に実行すること (先に更新すると新しい列を参照して失敗する)。

必要な設定: `secrets.AWS_ROLE_ARN` (Docker イメージと共用)、`secrets.POSTGRES_CERT`、`vars.AWS_REGION`、`vars.EXTERNAL_API_FUNCTION_NAME`。ロールには対象の関数への `lambda:UpdateFunctionCode`、`lambda:UpdateFunctionConfiguration`、`lambda:GetFunctionConfiguration` を許可する。
