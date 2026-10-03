# 外部プラットフォーム向け API 設計 (案)

第三者のプラットフォームが、本サービスへ投稿されたゲームを自分の実行基盤で起動するための読み取り専用 API。

## 前提と範囲

- 起動そのものは、外部プラットフォームのブラウザが S3 上のコンテンツ (`game.json` やアセット) を直接読む。S3 の CORS に外部プラットフォームの Origin を足して対応する。
- 本 API が受け持つのは次の 2 つ。
  - ゲームの検索・詳細 (タイトル・説明など、Akashic の仕様に定めのないメタデータ)
  - Akashic の `contents.json` の返却
- 対象は、投稿者が「外部プラットフォームでの起動」を許可したゲームだけとする。
- プレイ (部屋) の作成・参加・統計・称号など、本サービスの実行基盤に依存する機能は対象外。

## 現状

| 項目                    | 現状                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `contents.json`         | `GET /api/content/[id]` が返している。認可はなく、どのコンテンツでも返る                                                                  |
| 使用プラグイン          | `environment.external` のキーと、暗黙の `coe` 判定 (`content-get-external.ts`)。リクエストのたびに S3 から `game.json` を取得して導出する |
| プラグインの必須 / 任意 | 情報を持っていない                                                                                                                        |
| 外部起動の許可          | 情報を持っていない                                                                                                                        |
| ゲーム検索              | `GET /api/contents` (webapp 内部向け。`ok` 付きの包み、お気に入り情報などを含む)                                                          |

## 方針

1. **外部向けは別の名前空間に切り出す** (`/api/external/v1/...`)。webapp 内部の API は画面の都合で自由に変えたいので、外部との約束と分ける。版をパスに入れ、破壊的な変更は `v2` で出す。
2. **許可の判定は API で行う**。検索に出さないことに加え、`contents.json` も許可がなければ返さない。外部プラットフォームには起動のたびに `contents.json` を取得してもらい、許可の取り消しが起動に効くようにする。
3. **使用プラグインと必須 / 任意は投稿時に DB へ持つ**。検索の絞り込みに使うため、都度 S3 から `game.json` を取りに行く今の作りでは賄えない (`Content.scoreboard` と同じ理由)。
4. **既定はすべて「許可しない」「必須」**。許可は第三者へ情報を渡すことへの同意なので明示的に取る。必須 / 任意は、任意と誤って申告されると外部でゲームが壊れるため、投稿者が任意と明示したものだけ任意とする。

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
/// WHY: game.json には必須か任意かを書く場所がない。外部プラットフォームが対応していない
/// プラグインを使うゲームを起動してよいかは、投稿者に申告してもらうしかない。
/// バージョンごとに game.json が変わりうるため Content に紐付ける。
model ContentExternal {
  contentId Int
  name      String
  /// 未対応の実行基盤ではゲームが動かないか
  required  Boolean @default(true)

  content Content @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@id([contentId, name])
}
```

### 書き込むタイミング

| 操作                                        | 処理                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 新規投稿 (`registerContent`)                | `getContentExternal(gameJson)` の結果を `ContentExternal` へ。`required` はフォームの申告値 (既定 `true`)                         |
| 新バージョン投稿 (`content-edit`、zip あり) | 同上。前バージョンに同名のプラグインがあれば、その `required` をフォームの初期値に引き継ぐ                                        |
| 編集 (zip なし)                             | 最新 Content の `ContentExternal` の `required` を更新。行がない (この変更より前の投稿) 場合は S3 の `game.json` から導出して作る |
| 既存データ                                  | 一括の移行はしない。`externalLaunch` は既定オフなので、投稿者が許可を入れる編集の時点で上の「行がない場合」の処理で作られる       |

### 投稿・編集フォーム (`game-form.tsx`)

- 「外部プラットフォームでの起動を許可する」チェックボックス。説明文に、許可すると渡る情報 (タイトル・説明・クレジット・アイコン・投稿者名・ゲームデータ) と、取り消しても外部側の表示が消えるまで時間がかかること (後述のキャッシュ) を書く。
- 使用プラグインの一覧と、プラグインごとの「なくても動く (任意)」チェック。zip 選択時点で `game.json` から一覧を出す処理 (未対応プラグインの警告) がすでにあるので、そこに相乗りする。
- 規約・プライバシーポリシーに、許可したゲームの情報を外部プラットフォームへ提供する旨を追記する。

## API

### 共通

- ベースパス: `/api/external/v1`
- 認証なし、読み取り専用。
- 応答は HTTP ステータスで成否を表す (webapp 内部の `{ ok, reason }` の包みは使わない)。`contents.json` は Akashic のビューアーがそのまま読む形でなければならず包めないため、他のエンドポイントもそれに揃える。
  - エラー時の本文: `{ "reason": "NotFound" }` など
- `Cache-Control: public, max-age=60`。許可の取り消し・改名が外部に届くまで最大 60 秒かかることを許容する (統計 API と同じ扱い)。
- CORS: 環境変数 `EXTERNAL_PLATFORM_ORIGINS` (カンマ区切り) に一致する `Origin` にだけ `Access-Control-Allow-Origin` を返す。`contents.json` は外部プラットフォームのブラウザ上のビューアーが取得するため必要。S3 の CORS と同じ一覧を使う。
- `proxy.ts` の matcher から `/api/external/` を外す。外部からのリクエストに `guest_id` の Cookie を発行しないため。

### `GET /api/external/v1/games`

許可済みゲームの検索。

| パラメータ  | 型                              | 説明                                                                                      |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `q`         | string                          | タイトル・説明の部分一致 (大文字小文字を区別しない)                                       |
| `supported` | string (カンマ区切り)           | 呼び出し側が対応しているプラグイン名。**必須** プラグインがすべてこの中にあるゲームに絞る |
| `mode`      | `multi` \| `multi_admission`    | `environment.nicolive.supportedModes` に含むゲームに絞る                                  |
| `sort`      | `new` \| `updated` \| `popular` | 既定 `new` (投稿日の新しい順)。`popular` は `playCount` の多い順                          |
| `page`      | number                          | 0 始まり。既定 0                                                                          |
| `limit`     | number                          | 既定 20、上限 50                                                                          |

`supported` を省略した場合はプラグインで絞らない。`supported=` (空) は「何も対応していない」とみなし、必須プラグインのないゲームだけを返す。

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
      "publisher": {
        "id": "clx...",
        "name": "投稿者名"
      },
      "contentId": 456,
      "contentsJsonUrl": "https://akashic.example.com/api/external/v1/games/123/contents.json",
      "licenseUrl": "https://content.example.com/akashic-content/456/library_license.txt",
      "externals": [
        { "name": "coe", "required": true },
        { "name": "scoreboard", "required": false }
      ],
      "modes": ["multi_admission"],
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
- `licenseUrl`: `library_license.txt` がない場合は省く。内部 API のように本文を取得して載せると、1 件ごとに S3 を往復するため URL で渡す。
- `externals`: 最新バージョンの `ContentExternal`。
- `modes`: `game.json` の `supportedModes`。`niconico` の旧記法も既存の判定と同じく解釈する。絞り込みに使うため、これも投稿時に持つ (下記「未決事項」)。

### `GET /api/external/v1/games/{gameId}`

1 件分。本文は `items` の要素と同じ。許可されていない・存在しないゲームは `404`。両者を区別しない (許可していないゲームの存在を外部に知らせない)。

### `GET /api/external/v1/games/{gameId}/contents.json`

最新バージョンの `contents.json`。外部プラットフォームはこの URL をビューアーへ渡して起動する。

```json
{
  "content_id": 456,
  "content_url": "https://content.example.com/akashic-content/456/game.json",
  "asset_base_url": "https://content.example.com/akashic-content/456",
  "engine_urls": ["..."],
  "external": ["coe", "scoreboard"],
  "untrusted": false
}
```

- 許可されていない・存在しないゲームは `404`。
- ゲーム ID で引き、常に最新バージョンを返す。外部プラットフォームが contentId を控えて古いバージョンを起動し続けるのを避けるため、バージョンを固定する URL は提供しない。
- `external` は既存の `/api/content/[id]` と同じ (必須 / 任意を問わず使用するもの全部)。必須 / 任意はメタデータ側の `externals` で渡す。
- `engine_urls` の扱いは未決 (下記)。

## 許可の強制力について

API で絞っても、S3 の CORS はバケット単位で、プレフィックス (コンテンツ) ごとに Origin を分けられない。外部プラットフォームが許可されていないゲームの contentId を知っていれば、`game.json` を直接読んで起動できてしまう。

- 今回は「API に出さない・`contents.json` を返さない」までを許可の範囲とし、外部プラットフォームとの取り決め (許可されたゲームだけを本 API 経由で起動する) で担保する。
- 技術的に塞ぐ必要が出たら、CloudFront を前段に置き、CloudFront Functions + KeyValueStore に許可済み contentId を持たせて、外部 Origin からのリクエストを判定する。

また既存の `GET /api/content/[id]` は認可なしで任意のコンテンツの `contents.json` を返す。外部 Origin を CORS で許可しないので外部のブラウザからは読めないが、外部プラットフォームのサーバー経由なら読める。上と同じく取り決めの範囲とする。

## 実装の置き場所

| 対象                                       | 変更                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `schema/persist/prisma/schema.prisma`      | `Game.externalLaunch`、`ContentExternal` と migration                                  |
| `webapp/lib/server/content-register.ts` 他 | 投稿・編集時の `ContentExternal` の作成・引き継ぎ                                      |
| `webapp/components/game-form.tsx`          | 許可のチェック、プラグインごとの必須 / 任意                                            |
| `webapp/app/api/external/v1/...`           | 上記 3 エンドポイント                                                                  |
| `webapp/lib/server/external-*.ts`          | 検索 (プラグインの絞り込みは「最新 Content」との結合が要るため `$queryRaw`)、CORS 判定 |
| `webapp/proxy.ts`                          | matcher から `/api/external/` を除く                                                   |
| `schema/http`                              | 外部向けの OpenAPI 定義を足し、既存の Swagger UI で公開する                            |
| 規約・プライバシーポリシー                 | 外部プラットフォームへの情報提供の追記                                                 |

検索の絞り込み (`supported`) の SQL のイメージ:

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

ID を絞った後の詳細は Prisma の `findMany` で取る。

## 未決事項

1. **`engine_urls` に何を返すか**。いまの値は本サービスのエンジンファイルと、本サービスの akashic-storage へつなぐ独自の playlog-client。外部プラットフォームは自前の実行基盤を使うので、playlog-client は確実に差し替えになる。案:
   - (a) 本サービスのエンジンファイルだけ返す (playlog-client は除く)。webapp の `/akashic/` にも CORS が要る。
   - (b) 空配列を返し、エンジンは外部プラットフォームが `game.json` の `sandbox-runtime` を見て用意する。
   - 本サービスのエンジン配信の負荷を外部に負わせないため、(b) を推奨。
2. **`modes` を投稿時に持つか**。絞り込みに使うなら `Content` に列を足す。`game.json` は外部プラットフォームも読めるので、絞り込みを提供しないなら不要。
3. **`untrusted`** を外部向けでも `false` のままにするか。
4. **API キー**。今回は認証なしとしたが、利用状況を外部プラットフォームごとに把握したい・個別に止めたい場合はキーを発行する。CORS の許可を個別に行う時点で外部プラットフォームの登録は手作業になるため、件数が少ないうちは不要と考える。
5. **`scoreboard` の既定**。本サービス固有のプラグインで、多くのゲームはなくても動くと思われる。ほかと同じく既定を「必須」にするか、`scoreboard` だけ既定「任意」にするか。
