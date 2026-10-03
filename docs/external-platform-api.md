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
外部プラットフォーム ──▶ API Gateway (HTTP API) ──▶ Lambda (VPC 内) ──▶ PostgreSQL
外部プラットフォームのビューアー ──────────────────────────────────▶ S3: コンテンツ (CORS 許可)
```

- API は API Gateway (HTTP API) + Lambda で webapp の外に置く。メンテナンスで webapp を止めても、DB は動き続けるので API は止まらない。
- Lambda は DB を直接読む。webapp との間に中間データ (S3 に書き出した一覧など) を挟まないので、同期の仕組みが要らず、許可の取り消し・改名もすぐに反映される。
- Lambda は DB に届く VPC・サブネットに置き、DB のセキュリティグループで Lambda からの 5432 を許可する。S3 などほかの AWS サービスは呼ばないので、NAT や VPC エンドポイントは要らない。

### DB への負荷

認証なしで公開する API が本サービスの DB を叩くので、外部からのリクエストの量で本サービスが重くならないよう、接続数と頻度に上限を設ける。

- Lambda の予約済み同時実行数を小さく (例: 5) 抑え、Lambda 1 つあたりの接続プールを 1 にする。DB への接続は最大でも同時実行数と同じ数で止まる。RDS Proxy は使わない。
- API Gateway のスロットリング (例: 20 req/s、バースト 40) で頻度を抑える。上限を超えた分は `429` を返す。
- 応答に `Cache-Control: public, max-age=60` を付け、外部プラットフォーム側 (ブラウザ・サーバー) で同じ応答を使い回してもらう。HTTP API 自体には応答のキャッシュが無いので、それでも足りなくなったら前段に CloudFront を置く。

### DB スキーマの変更との順序

Lambda は webapp と同じ `@multi-indiegame/persist-schema` で生成した Prisma クライアントを使う。migration で Lambda が読む列 (`Game`, `Content`, `User`, `ContentExternal`) を変えるときは、webapp と同じく migration の後に Lambda を更新する。列の削除・改名をする場合は、Lambda を先に新しい列へ移してから消す。

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
  required  Boolean @default(false)

  content Content @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@id([contentId, name])
}
```

### 必須 / 任意の既定

すべてのプラグイン (`coe`, `send`, `scoreboard`, `playerBan`, `atsumaru` など) で既定は **任意** とする。プラグインがなくても動くように作るのはコンテンツ側の努力義務で、なければ動かないものだけを投稿者が「必須」と申告する。

### 書き込むタイミング

| 操作                                        | 処理                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 新規投稿 (`registerContent`)                | `getContentExternal(gameJson)` の結果を `ContentExternal` へ。`required` はフォームの申告値 (既定は任意)                          |
| 新バージョン投稿 (`content-edit`、zip あり) | 同上。前バージョンに同名のプラグインがあれば、その `required` をフォームの初期値に引き継ぐ                                        |
| 編集 (zip なし)                             | 最新 Content の `ContentExternal` の `required` を更新。行がない (この変更より前の投稿) 場合は S3 の `game.json` から導出して作る |

既存データの移行はしない。`externalLaunch` は既定オフなので、許可を入れる編集の時点で上の「行がない場合」の処理で作られれば足りる。

### 画面

- 投稿・編集フォーム (`game-form.tsx`)
  - 「外部プラットフォームでの起動を許可する」チェックボックス。許可すると渡る情報 (タイトル・説明・クレジット・アイコン・投稿者名・ゲームデータ) と、取り消してから外部に反映されるまで最大 60 秒ほどかかることを書く。
  - 使用プラグインの一覧と、プラグインごとの「これがないと動かない (必須)」の切り替え。zip 選択時に `game.json` から未対応プラグインを警告している処理に相乗りする。
- ゲームページ: 使用プラグインと必須 / 任意を表示する。今は説明欄に手書きしている対応状況を、ここへ移せるようにする。
- 規約・プライバシーポリシー: 許可したゲームの情報を外部プラットフォームへ提供する旨を追記する。

## API

### 共通

- API Gateway の HTTP API。ベースパス `/v1`。独自ドメイン (例: `external-api.example.com`) を当てる。
- 認証なし、読み取り専用。
- 応答は HTTP ステータスで成否を表す。`contents.json` はビューアーがそのまま読む形でなければならず `{ ok, reason }` で包めないため、他のエンドポイントもそれに揃える。
  - エラー時の本文: `{ "reason": "NotFound" }` / `{ "reason": "InvalidParams" }` / `{ "reason": "InternalError" }` (`429` は API Gateway が返すため `{ "message": "Too Many Requests" }`)
- `Cache-Control: public, max-age=60`。許可の取り消し・改名が外部に届くまで最大 60 秒かかることを許容する (統計 API と同じ扱い)。
- CORS: HTTP API の CORS 設定で、外部プラットフォームの Origin を許可する。`contents.json` は外部プラットフォームのブラウザ上のビューアーが取得するため必要。S3 の CORS と同じ一覧にする。
- スロットリングと同時実行数の上限は「DB への負荷」を参照。

### `GET /v1/games`

許可済みゲームの検索。

| パラメータ  | 型                              | 説明                                                                                                 |
| ----------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `q`         | string                          | タイトル・説明の部分一致 (大文字小文字を区別しない)                                                  |
| `supported` | string (カンマ区切り)           | 呼び出し側が対応しているプラグイン名。**必須** プラグインがすべてこの中にあるゲームに絞る            |
| `sort`      | `new` \| `updated` \| `popular` | 既定 `new` (投稿日の新しい順)。`updated` は最新バージョンの投稿日、`popular` は `playCount` の多い順 |
| `page`      | number                          | 0 始まり。既定 0                                                                                     |
| `limit`     | number                          | 既定 20、上限 50                                                                                     |

- `supported` を省略した場合はプラグインで絞らない。`supported=` (空) は「何も対応していない」とみなし、必須プラグインのないゲームだけを返す。

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
      "streaming": true,
      "playCount": 42,
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
- `streaming`: 投稿者が設定した実況・配信の可否。`false` のゲームは、外部プラットフォームが配信不可であることを利用者に表示し、守らせる。
- `licenseUrl`: `library_license.txt` がない場合も載せる (`404` になる)。あるかどうかを確かめるには 1 件ごとに S3 を往復する必要があるため。
- `iconUrl` などのコンテンツの URL と `pageUrl` は、Lambda の環境変数 (`PUBLIC_CONTENT_BASE_URL`, `PUBLIC_BASE_URL`) から webapp と同じ規則で組み立てる。
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

| 対象                                            | 変更                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `schema/persist/prisma/schema.prisma`           | `Game.externalLaunch`、`ContentExternal` と migration                                                                         |
| `schema/persist/src/index.ts`                   | 接続プールの大きさを指定して Prisma クライアントを作る関数を足す (Lambda はプールを 1 にするため)                             |
| `external-api/` (新規)                          | Lambda のハンドラ。DB の読み取りと応答の組み立て。OpenAPI 定義もここから出力する                                              |
| `webapp/lib/server/content-*.ts`                | `ContentExternal` の作成・引き継ぎ                                                                                            |
| `webapp/components/game-form.tsx`、ゲームページ | 許可のチェック、プラグインごとの必須 / 任意の入力と表示                                                                       |
| `schema/http/build-swagger.js`                  | `external-api` の OpenAPI を既存の Swagger UI に加える                                                                        |
| `.github/workflows/external-api.yml`            | `external-api` を esbuild で 1 ファイルにまとめ、DB の証明書と zip にして `aws lambda update-function-code` で更新 (手動実行) |
| 規約・プライバシーポリシー                      | 外部プラットフォームへの情報提供の追記                                                                                        |

検索の絞り込み (`supported`) は「最新の Content」との結合が要るため `$queryRaw` で ID を絞り、詳細は Prisma の `findMany` で取る。

```sql
SELECT g.id
FROM "Game" g
JOIN LATERAL (
  SELECT c.id FROM "Content" c WHERE c."gameId" = g.id ORDER BY c.id DESC LIMIT 1
) latest ON true
WHERE g."externalLaunch"
  AND NOT EXISTS (
    SELECT 1 FROM "ContentExternal" ce
    WHERE ce."contentId" = latest.id
      AND ce.required
      AND ce.name <> ALL($1::text[])
  )
ORDER BY g.id DESC
LIMIT $2 OFFSET $3
```

Prisma 7 はドライバアダプタ (`@prisma/adapter-pg`) で動き、ネイティブのクエリエンジンを持たないので、esbuild でまとめて zip で配れる。コンテナイメージより小さく、コールドスタートも短い。デプロイは migration を当てた後に手動で実行する (先に更新すると新しい列を参照して失敗するため)。AWS 側の設定は `external-api/README.md` にまとめる。

## 決定事項

- AWS リソース (API Gateway・Lambda・VPC 設定・IAM) は手作業で作る。IaC はリポジトリに入れない。Lambda のコードは `external-api/` としてリポジトリに入れる。
- `Content.scoreboard` は今のまま残す。`ContentExternal` への統合は後日別途行う。
