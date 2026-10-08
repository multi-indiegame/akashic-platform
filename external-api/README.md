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

| 名前                      | 内容                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | webapp と同じ DB。証明書は zip に同梱する `postgres.pem` を `sslrootcert=/var/task/postgres.pem` で指す。`DATABASE_URL_PARAMETER` を設定した場合は使わない |
| `DATABASE_URL_PARAMETER`  | `DATABASE_URL` の値を持つ SSM Parameter Store のパラメータ名 (例: `/akashic/database-url`)。下の「SSM Parameter Store から読む場合」を参照                 |
| `PUBLIC_BASE_URL`         | webapp の公開 URL (ゲームページの URL に使う)                                                                                                              |
| `PUBLIC_CONTENT_BASE_URL` | コンテンツ配信の公開 URL (webapp と同じ値)                                                                                                                 |
| `PUBLIC_API_BASE_URL`     | 本 API の公開 URL。省略時はリクエストのホスト名から組み立てる                                                                                              |

### SSM Parameter Store から読む場合

`DATABASE_URL` を環境変数に直接置かず、SSM Parameter Store から AWS Parameters and Secrets Lambda Extension 経由で読む。

- パラメータ: `DATABASE_URL` と同じ形式の値を SecureString で作り、その名前を `DATABASE_URL_PARAMETER` に設定する
- レイヤー: AWS Parameters and Secrets Lambda Extension を関数に追加する (ARN はリージョン・アーキテクチャごとに AWS のドキュメントを参照)
- IAM: 関数の実行ロールに、そのパラメータへの `ssm:GetParameter` を許可する。カスタマー管理の KMS キーで暗号化している場合は、そのキーへの `kms:Decrypt` も許可する
- ネットワーク: 関数は VPC 内にあるため、拡張機能が SSM に届く経路が要る。SSM のインターフェイス型 VPC エンドポイント (`com.amazonaws.<リージョン>.ssm`) を関数のサブネットに作るか、NAT を通す
- 取得は実行環境ごとに最初のリクエストで 1 回だけ行う。パラメータの値を変えた場合は、新しい実行環境から反映される (関数の設定を更新すると入れ替わる)
- 拡張機能のポートを既定 (2773) から変えた場合は、`PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` に同じ値を設定する

### API Gateway (HTTP API)

- ルート: `GET /v1/{proxy+}` を Lambda に統合する (パスの振り分けは Lambda で行う)
- ステージ: `$default` (パスにステージ名を含めないため)
- CORS: 外部プラットフォームの Origin を許可する。メソッドは `GET`。S3 のコンテンツの CORS と同じ一覧にする
- スロットリング: ステージの既定ルートに上限 (例: 20 req/s、バースト 40) を設定する
- 独自ドメイン `api.multi-indiegame.net` を当てる。証明書は API と同じリージョンの ACM で発行する (Swagger の `servers` もこのドメイン)

## デプロイ

GitHub Actions の「Deploy External API」を手動で実行する。DB の migration を当てた後に実行すること (先に更新すると新しい列を参照して失敗する)。

必要な設定: `secrets.AWS_ROLE_ARN` (Docker イメージと共用)、`secrets.POSTGRES_CERT`、`vars.AWS_REGION`、`vars.EXTERNAL_API_FUNCTION_NAME`。ロールには対象の関数への `lambda:UpdateFunctionCode`、`lambda:UpdateFunctionConfiguration`、`lambda:GetFunctionConfiguration` を許可する。
