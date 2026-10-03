# 外部プラットフォーム向け API 設計 (案)

第三者のプラットフォームが、本サービスへ投稿されたゲームを自分の実行基盤で起動するための読み取り専用 API。

## 前提と範囲

- 起動そのものは、外部プラットフォームのブラウザが S3 上のコンテンツ (`game.json` やアセット) を直接読む。S3 の CORS に外部プラットフォームの Origin を足して対応する。
- 本 API が受け持つのは次の 2 つ。
  - ゲームの検索・詳細 (タイトル・説明など、Akashic の仕様に定めのないメタデータ)
  - Akashic の `contents.json` の返却
- 対象は、投稿者が「外部プラットフォームでの起動」を許可したゲームだけとする。
- 許可していないゲームの起動を技術的に防ぐことはしない。API (検索・`contents.json`) に出さないところまでを許可の範囲とする。
- 本サービスのメンテナンス中 (webapp 停止中) も API は止めない。
- プレイ (部屋) の作成・参加・統計・称号など、本サービスの実行基盤に依存する機能は対象外。

## 構成

```
                        (投稿・編集・削除・改名のたびに作り直す)
webapp ── DB 更新 ──▶ カタログ生成 ──PutObject──▶ S3: カタログ (catalog.json)
                                                        ▲
                                                        │ GetObject (メモリに 60 秒キャッシュ)
外部プラットフォーム ──▶ API Gateway (HTTP API) ──▶ Lambda
外部プラットフォームのビューアー ──────────────────────▶ S3: コンテンツ (CORS 許可)
```

- API は API Gateway (HTTP API) + Lambda で webapp の外に置く。
- Lambda は DB を読まず、webapp が S3 に置く **カタログ** (許可済みゲームのメタデータを 1 ファイルにまとめた JSON) だけを読む。

### DB を直接読まない理由

- メンテナンスで DB を止める場合、API も一緒に止まる。カタログなら最後に書いた状態で応答し続けられる。
- DB に繋ぐには Lambda を VPC に置き、接続数の管理 (RDS Proxy など) と Prisma のバンドルが要る。
- 対象は許可済みのゲームだけで、件数は多くない。カタログ全体をメモリに載せて絞り込めば足りる。

メンテナンス中は webapp への書き込みがドレインで止まっているので、カタログが古くなることもない。

## カタログ

### 形式

```json
{
  "version": 1,
  "generatedAt": "2026-10-03T00:00:00.000Z",
  "games": [
    {
      "id": 123,
      "title": "ゲームのタイトル",
      "description": "説明文 (プレーンテキスト)",
      "credit": "素材のクレジット",
      "iconUrl": "https://content.example.com/akashic-content/456/icon1a2b3c.png",
      "pageUrl": "https://akashic.example.com/game/123/",
      "publisher": { "id": "clx...", "name": "投稿者名" },
      "contentId": 456,
      "contentUrl": "https://content.example.com/akashic-content/456/game.json",
      "assetBaseUrl": "https://content.example.com/akashic-content/456",
      "licenseUrl": "https://content.example.com/akashic-content/456/library_license.txt",
      "externals": [
        { "name": "coe", "required": true },
        { "name": "scoreboard", "required": false }
      ],
      "createdAt": "2026-09-01T00:00:00.000Z",
      "updatedAt": "2026-09-20T00:00:00.000Z"
    }
  ]
}
```

URL はすべて webapp 側で組み立てて入れる。Lambda にコンテンツ配信の URL などの設定を持たせないため。

### 作り直すタイミング

DB から許可済みのゲームを全件引き直して丸ごと書き換える。差分で更新しないので、何度呼んでも同じ結果になる。

| 操作                                                                                   | 場所                                          |
| -------------------------------------------------------------------------------------- | --------------------------------------------- |
| 新規投稿 (許可ありの場合)                                                              | `content-register.ts`                         |
| 編集 (タイトル・説明・クレジット・アイコン・新バージョン・許可の切り替え・必須 / 任意) | `content-edit.ts`                             |
| ゲーム削除                                                                             | `content-delete.ts`                           |
| 投稿者の改名 (許可済みのゲームを持つ場合)                                              | `user.ts` (`updateUserNameAction`)            |
| 手動 (障害からの復旧用)                                                                | manager-server に `/external-catalog/rebuild` |

- 書き込みに失敗したら、DB の更新はそのままにして投稿者にエラーを表示する。保存し直せば作り直される (内容に変更がなくても作り直す)。
- 2 人の投稿者の保存がほぼ同時に重なると、先に DB を読んだ側が後から書き、片方の変更がカタログに載らないことがある。まれで、どちらかが保存し直せば直るので許容する。
- カタログを定期的に作り直すジョブは足さない (manager-server に定期ジョブを足さない方針のため)。手動の作り直しだけを manager-server のエンドポイントとして置く。
- カタログ用のバケットの設定 (`EXTERNAL_CATALOG_BUCKET`) が無い環境 (ローカル・Docker Compose) では作り直しを飛ばす。

### 置き場所

コンテンツ配信用とは別の、公開しないバケットに置く。webapp と manager-server に `PutObject`、Lambda に `GetObject` だけを許す。

## データモデルの変更 (`schema/persist`)

```prisma
model Game {
  // ...既存
  /// 外部プラットフォームでの起動を許可するか。
  ///
  /// WHY: 既定はオフ。許可するとタイトル・説明・アイコン・投稿者名を第三者へ渡すことになるため、
  /// 投稿者の明示的な同意を要する。
  externalLaunch Boolean @default(false)
}

model Content {
  // ...既存
  externals ContentExternal[]
}

/// コンテンツが使う拡張プラグイン (`environment.external` と暗黙の coe) と、その必須 / 任意。
///
/// WHY: game.json には必須か任意かを書く場所がない。対応していない実行基盤でも動くかは、
/// ゲームがプラグインの有無で処理を切り替えているかどうかで決まり、投稿者にしか分からない。
/// バージョンごとに game.json が変わりうるため Content に紐付ける。
model ContentExternal {
  contentId Int
  name      String
  /// 未対応の実行基盤ではゲームが動かないか
  required  Boolean

  content Content @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@id([contentId, name])
}
```

### 必須 / 任意の既定

| プラグイン                    | 既定 | 理由                                                                                 |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------ |
| `scoreboard`, `playerBan`     | 任意 | ゲームが対応の有無で処理を切り替える前提で作られている                               |
| 上記以外 (`coe`, `send` など) | 必須 | ゲームの進行そのものに使う。任意と誤って申告されると外部でゲームが壊れるため保守的に |

既定は `webapp/lib/types.ts` の `supportedExternalPlugins` の隣に持つ。

### 書き込むタイミング

| 操作                                        | 処理                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 新規投稿 (`registerContent`)                | `getContentExternal(gameJson)` の結果を `ContentExternal` へ。`required` はフォームの申告値                                       |
| 新バージョン投稿 (`content-edit`、zip あり) | 同上。前バージョンに同名のプラグインがあれば、その `required` をフォームの初期値に引き継ぐ                                        |
| 編集 (zip なし)                             | 最新 Content の `ContentExternal` の `required` を更新。行がない (この変更より前の投稿) 場合は S3 の `game.json` から導出して作る |

既存データの移行はしない。`scoreboard` と `playerBan` を使っているのは運営者のゲームだけで、`externalLaunch` も既定オフなので、許可を入れる編集の時点で上の「行がない場合」の処理で作られれば足りる。

### 画面

- 投稿・編集フォーム (`game-form.tsx`)
  - 「外部プラットフォームでの起動を許可する」チェックボックス。許可すると渡る情報 (タイトル・説明・クレジット・アイコン・投稿者名・ゲームデータ) と、取り消してから外部に反映されるまで最大 2 分ほどかかることを書く。
  - 使用プラグインの一覧と、プラグインごとの「なくても動く (任意)」の切り替え。zip 選択時に `game.json` から未対応プラグインを警告している処理に相乗りする。
- ゲームページ: 使用プラグインと必須 / 任意を表示する。今は説明欄に手書きしている対応状況を、ここへ移せるようにする。
- 規約・プライバシーポリシー: 許可したゲームの情報を外部プラットフォームへ提供する旨を追記する。

## API

### 共通

- API Gateway の HTTP API。ベースパス `/v1`。独自ドメイン (例: `external-api.example.com`) を当てる。
- 認証なし、読み取り専用。
- 応答は HTTP ステータスで成否を表す。`contents.json` はビューアーがそのまま読む形でなければならず `{ ok, reason }` で包めないため、他のエンドポイントもそれに揃える。
  - エラー時の本文: `{ "reason": "NotFound" }` / `{ "reason": "InvalidParams" }`
- `Cache-Control: public, max-age=60`。Lambda 内のカタログのキャッシュ (60 秒) と合わせ、許可の取り消し・改名が外部に届くまで最大 2 分ほどかかることを許容する。
- CORS: HTTP API の CORS 設定で、外部プラットフォームの Origin を許可する。`contents.json` は外部プラットフォームのブラウザ上のビューアーが取得するため必要。S3 の CORS と同じ一覧にする。
- スロットリング: 認証なしで Lambda の課金が際限なく増えないよう、ステージの既定ルートに上限 (例: 20 req/s、バースト 40) を設定する。

### `GET /v1/games`

許可済みゲームの検索。

| パラメータ  | 型                    | 説明                                                                                      |
| ----------- | --------------------- | ----------------------------------------------------------------------------------------- |
| `q`         | string                | タイトル・説明の部分一致。NFKC 正規化と小文字化をしてから比べる                           |
| `supported` | string (カンマ区切り) | 呼び出し側が対応しているプラグイン名。**必須** プラグインがすべてこの中にあるゲームに絞る |
| `sort`      | `new` \| `updated`    | 既定 `new` (投稿日の新しい順)。`updated` は最新バージョンの投稿日の新しい順               |
| `page`      | number                | 0 始まり。既定 0                                                                          |
| `limit`     | number                | 既定 20、上限 50                                                                          |

- `supported` を省略した場合はプラグインで絞らない。`supported=` (空) は「何も対応していない」とみなし、必須プラグインのないゲームだけを返す。
- 人気順 (プレイ数) は提供しない。プレイ数はプレイのたびに変わり、そのたびにカタログを作り直すことはしないため。

応答 `200`:

```json
{
  "items": [
    {
      "id": 123,
      "title": "ゲームのタイトル",
      "description": "説明文 (プレーンテキスト)",
      "credit": "素材のクレジット",
      "iconUrl": "https://content.example.com/akashic-content/456/icon1a2b3c.png",
      "pageUrl": "https://akashic.example.com/game/123/",
      "publisher": { "id": "clx...", "name": "投稿者名" },
      "contentId": 456,
      "contentsJsonUrl": "https://external-api.example.com/v1/games/123/contents.json",
      "licenseUrl": "https://content.example.com/akashic-content/456/library_license.txt",
      "externals": [
        { "name": "coe", "required": true },
        { "name": "scoreboard", "required": false }
      ],
      "createdAt": "2026-09-01T00:00:00.000Z",
      "updatedAt": "2026-09-20T00:00:00.000Z"
    }
  ],
  "page": 0,
  "limit": 20,
  "hasNext": true
}
```

- `id` / `contentId`: ゲーム (投稿単位) と、その最新バージョン。
- `pageUrl`: 本サービスのゲームページ。外部での表示時に出典として載せてもらう想定。
- `licenseUrl`: `library_license.txt` がない場合は省く。
- `contentsJsonUrl`: Lambda がリクエストのホスト名から組み立てる。

### `GET /v1/games/{gameId}`

1 件分。本文は `items` の要素と同じ。許可されていない・存在しないゲームは `404`。両者を区別しない (許可していないゲームの存在を外部に知らせない)。

### `GET /v1/games/{gameId}/contents.json`

最新バージョンの `contents.json`。外部プラットフォームはこの URL をビューアーへ渡して起動する。

```json
{
  "content_id": 456,
  "content_url": "https://content.example.com/akashic-content/456/game.json",
  "asset_base_url": "https://content.example.com/akashic-content/456",
  "engine_urls": [],
  "external": ["coe", "scoreboard"],
  "untrusted": false
}
```

- 許可されていない・存在しないゲームは `404`。
- `engine_urls` は空配列。エンジンと playlog-client は外部プラットフォームが `game.json` の `sandbox-runtime` を見て用意する。
- `external` は必須 / 任意を問わず使用するもの全部 (既存の `/api/content/[id]` と同じ)。必須 / 任意はメタデータ側の `externals` で渡す。
- `untrusted` は受け入れ側が決めるものだが、念のため既存と同じ `false` を入れる。
- ゲーム ID で引き、常に最新バージョンを返す。外部プラットフォームが contentId を控えて古いバージョンを起動し続けるのを避けるため、バージョンを固定する URL は提供しない。

## リポジトリ上の置き場所

| 対象                                            | 変更                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `schema/persist/prisma/schema.prisma`           | `Game.externalLaunch`、`ContentExternal` と migration                                                |
| `schema/external-catalog/` (新規)               | カタログの型と、DB から組み立てて S3 へ書く処理。webapp と manager-server で共用する                 |
| `external-api/` (新規)                          | Lambda のハンドラ。カタログの型だけに依存し、Prisma は持ち込まない。OpenAPI 定義もここから出力する   |
| `webapp/lib/server/content-*.ts`, `user.ts`     | `ContentExternal` の作成・引き継ぎと、カタログの作り直しの呼び出し                                   |
| `webapp/components/game-form.tsx`、ゲームページ | 許可のチェック、プラグインごとの必須 / 任意の入力と表示                                              |
| `manager-server`                                | `/external-catalog/rebuild`                                                                          |
| `schema/http/build-swagger.js`                  | `external-api` の OpenAPI を既存の Swagger UI に加える                                               |
| `.github/workflows/`                            | `external-api` を esbuild で 1 ファイルにまとめ、zip にして `aws lambda update-function-code` で更新 |
| 規約・プライバシーポリシー                      | 外部プラットフォームへの情報提供の追記                                                               |

Lambda はコンテナイメージにもできるが、依存がほぼ無く小さいので、コールドスタートの短い zip 配布にする。デプロイは既存の Docker イメージと同じく、バージョンが上がったときだけ行う。

## 未決事項

1. **AWS リソースの作り方**。API Gateway・Lambda・カタログ用バケット・IAM をコンソールで手作業で作るか、IaC (CDK / Terraform など) をリポジトリに入れるか。今は既存のサービスも IaC がリポジトリに無いため、合わせるなら手作業。
2. **`Content.scoreboard` を `ContentExternal` へまとめるか**。`scoreboard` の行があるかで同じことが分かるので、列は不要になる。統計まわりの参照箇所を書き換えることになるため、本件とは分けて行うのがよいと考える。
