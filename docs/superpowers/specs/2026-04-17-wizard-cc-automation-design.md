# Wizard からの Contact Center 作成 / Permission Set 割り当て自動化

- Date: 2026-04-17
- Status: Design approved
- Scope: Setup Wizard (`setup.html`) に「Partner Telephony Contact Center 作成」と「Permission Set 割り当て」を組み込み、現状 README に手順記載されている CLI 手作業を UI から完結させる。

## 1. 目的と背景

現状の VoxCanvas Setup Wizard は証明書生成と `.env` 書き出しのみ自動化しており、以下は README を読んでユーザーが `sf` CLI を手打ちする必要がある:

- `ConversationVendorInfo` メタデータの deploy
- Contact Center 作成(Setup UI での XML アップロード)
- Public Key の Contact Center 登録
- Permission Set (`ContactCenterAdminExternalTelephony` / `ContactCenterAgentExternalTelephony`) の割り当て

FDE がデモ環境を繰り返し構築する運用上、これらを毎回手動で行うのは摩擦が大きい。本設計ではウィザードから完結させることで、初回セットアップ時間を大幅に短縮する。

## 2. スコープ

### In scope

- `ConversationVendorInfo` + `ContactCenter` メタデータテンプレートの同梱
- ウィザードから `sf` CLI を呼び出す backend layer
- Org 選択 / ngrok 起動(optional) / deploy / permset 割り当てを行う UI
- SSE 経由のリアルタイムログ + ファイル永続化
- エラー検知とヒント表示(ライセンス未付与等の定型エラー)
- 冪等性(同名 CC が存在する場合の確認フロー)
- セットアップ完了時のクリーンアップ(ログ / 一時ファイル / ウィザード発プロセス)

### Out of scope

- Service Console 設定(Omni-Channel Utility 追加、Voice Call ページの Enhanced Conversation 配置)
- Connected App / External Client App 関連(廃止済み)
- Scratch Org 作成
- ngrok を内蔵せず、外部バイナリに依存
- 非 localhost からのセットアップ(`localhostOnly` 維持)

## 3. ユーザーフロー

ウィザードは 7 ステップに再構成する。

| # | ID | 変更 | 内容 |
|---|---|---|---|
| 1 | welcome | 既存 | 環境チェック(node / sf / openssl / ngrok) |
| 2 | certificate | 既存 | HTTPS + JWT 証明書を生成 |
| 3 | org-auth | **新規** | `sf` の既定 Org を表示、別の alias 選択または `sf org login web` |
| 4 | contact-center | **改修** | Service Endpoint(ngrok URL)、CC Developer Name、Master Label を入力 → deploy |
| 5 | permset | **新規** | Admin / Agent 2 つの permset を `sf org assign permset` |
| 6 | test | 既存 | SCRT2 への疎通確認 |
| 7 | complete | 改修 | サマリ表示 + Cleanup セクション + `.env` 書き出し |

### Step 3: org-auth

- 既定 Org があれば `sf org display --json` で以下を取得:
  - `orgId`, `username`, `alias`, `instanceUrl`, `myDomainUrl`
  - `scrtBaseUrl` = `myDomainUrl` の `.my.salesforce.com` を `.my.salesforce-scrt.com` に置換
- UI:
  - [この Org を使う] — 自動取得値を state に保存して次へ
  - [別の Org を選ぶ] — `sf org list --json` からドロップダウン
  - [新規ログイン] — `sf org login web --alias <入力>` を spawn、SSE でログ表示
- ブラウザが自動で開く旨を UI に注意書き

### Step 4: contact-center

- 入力フィールド:
  - **Service Endpoint URL**(必須): ngrok のようなパブリック HTTPS URL。`/connector` 等のパスは不要
  - **[ngrok を起動]** ボタン(ngrok 検出時のみ表示): 内部で `ngrok http 3030` を起動し、`http://127.0.0.1:4040/api/tunnels` をポーリングしてパブリック URL を取得、フィールドに自動入力
  - **CC Developer Name**(デフォルト `VoxCanvas_CC`): 半角英数 + `_` のみ許可
  - **CC Master Label**(デフォルト `VoxCanvas Contact Center`)
- [Deploy] クリック時:
  1. `sf data query -q "SELECT Id, DeveloperName FROM ContactCenter WHERE DeveloperName = '<name>'"` で衝突チェック
  2. 衝突時: ダイアログで [スキップ] / [上書き] / [名前変更]
  3. メタデータを `os.tmpdir()/voxcanvas-meta-<runId>/` にレンダリング(後述)
  4. `sf project deploy start --source-dir <tmp> --target-org <alias>` を spawn
  5. SSE でログ配信
  6. 完了後に `state.callCenterApiName` を保存

### Step 5: permset

- 表示: 割り当て対象 permset 名(固定):
  - `ContactCenterAdminExternalTelephony`
  - `ContactCenterAgentExternalTelephony`
- 入力: 割り当て先ユーザー(デフォルト = 接続中ユーザー username、別ユーザーも入力可)
- [Assign] で順次実行。エラーが出ても両方試行してから結果表示

### Step 7: complete

- サマリ表示: Org Alias / Org ID / SCRT URL / CC API Name / 割り当て済み permset
- 入力: **Call Center Phone**(optional)
- **Cleanup セクション**(全てチェックボックス、デフォルト ON):
  - `[x] セットアップログを削除(<size>, <count> files)`
  - `[x] 一時メタデータディレクトリを削除`
  - `ウィザードで起動したプロセス`:
    - `[x] ngrok (pid <pid>)`  ← 起動していれば表示
- [Save & Finish] で `/setup/complete` を呼び、
  1. `.env` 書き出し
  2. scrt2Client 再設定
  3. チェックされた項目のクリーンアップ
  4. Dashboard へのリンクを表示

## 4. アーキテクチャ

```
Browser (setup.html + setup-app.js)
  │
  │  /api/setup/*  (localhostOnly)
  ▼
Express server
  ├── routes/setup.js          ← エンドポイント定義
  └── setup/
        logger.js              ← バッファ + ファイル追記 + SSE ブロードキャスト
        sfRunner.js            ← sf CLI を spawn、stdout/stderr 逐次パース
        processRegistry.js     ← ngrok 等のウィザード発プロセス管理
        metadataRenderer.js    ← テンプレート XML レンダリング + tmp 書き出し
        hints.js               ← エラーパターン → ヒント変換
  │
  │  spawn
  ▼
sf CLI / ngrok / openssl
  │
  ▼
Salesforce Org
```

### 責務分担

- **Front**: ステップ UI、SSE 受信、ログパネル表示、state 管理
- **Backend**: `sf` / `ngrok` 呼び出し、XML レンダリング、SSE 配信、ログ永続化、プロセス追跡
- **Metadata**: `metadata/voxcanvas-contact-center/` 配下の templates

### セキュリティ

- 全 `/api/setup/*` は `localhostOnly` を継続
- ユーザー入力値は `SAFE_VALUE` 正規表現 + XML エスケープで二重防御
- `sf` / `ngrok` の spawn は `shell: false` + 配列引数で shell injection を防止
- 一時ディレクトリは `os.tmpdir()` 下、実行ごとに一意命名(`voxcanvas-meta-<ulid>`)、完了後削除

## 5. API 設計

全て `localhostOnly`。JSON が基本、長時間処理は SSE。

| Method | Path | 用途 | レスポンス形式 |
|---|---|---|---|
| GET | `/setup/status` | 既存: 環境チェック。`sfVersion`, `ngrokVersion`, `opensslAvailable`, 設定済みフラグ | JSON |
| POST | `/setup/certificate` | 既存: cert 生成 | JSON |
| GET | `/setup/certificate/download` | 既存: jwt.pem ダウンロード | file |
| GET | `/setup/public-key` | 既存: jwt.pem テキスト | text/plain |
| GET | `/setup/org` | 既定 Org 取得(`sf config get target-org` + `sf org display --json`) | JSON |
| GET | `/setup/org/list` | `sf org list --json` の結果を整形 | JSON array |
| POST | `/setup/org/login` | `sf org login web --alias <alias>` を spawn、ブラウザが開く | SSE |
| POST | `/setup/org/select` | 選択 alias をサーバーメモリに保存、`sf org display` で詳細も取得して返す | JSON |
| GET | `/setup/cc/check?name=<devName>` | 同名 CC の存在確認 | JSON `{ exists, id? }` |
| POST | `/setup/cc/deploy` | body: `{ serviceEndpoint, developerName, masterLabel, onConflict }` → レンダリング + deploy | SSE |
| POST | `/setup/permset/assign` | body: `{ permsetNames: string[], targetUser? }` | SSE |
| POST | `/setup/ngrok/start` | ngrok spawn + URL 取得 | JSON `{ url, pid }` |
| POST | `/setup/ngrok/stop` | 起動した ngrok を SIGTERM | JSON |
| GET | `/setup/processes` | 起動中のウィザード発プロセス一覧 | JSON array |
| POST | `/setup/processes/stop-all` | 全部停止 | JSON |
| GET | `/setup/logs/:runId` | 過去ログファイル取得 | text/plain |
| POST | `/setup/complete` | 改修: `.env` 書き出し + cleanup | JSON |

### SSE イベント形式

```
event: log
data: {"ts":"2026-04-17T10:23:45.012Z","level":"info","step":"deploy","action":"sf-exec","message":"sf project deploy start ..."}

event: hint
data: {"ts":"...","level":"hint","step":"deploy","message":"Partner Telephony ライセンス未付与の可能性..."}

event: done
data: {"success":true,"runId":"01HP...","result":{...}}
```

クライアント側では `EventSource` で購読。`done` 受信で自動 close。

### プロセス追跡

- `processRegistry` は `Map<name, { pid, child, startedAt, label }>`
- 登録時: `child.on('exit')` で自動除去
- サーバー終了時: 全てに SIGTERM(Express の `close` イベントでフック)
- `/setup/processes` でスナップショット返却

## 6. メタデータテンプレート

配置:

```
metadata/voxcanvas-contact-center/
├── package.xml
├── conversationVendorInfos/
│   └── VoxCanvas.conversationVendorInfo-meta.xml
└── contactCenters/
    └── TEMPLATE.contactCenter-meta.xml    ← レンダリング時にファイル名も置換
```

### ConversationVendorInfo (固定)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ConversationVendorInfo xmlns="http://soap.sforce.com/2006/04/metadata">
    <developerName>VoxCanvas</developerName>
    <masterLabel>VoxCanvas Partner Telephony</masterLabel>
    <conversationVendorType>VOICE_PARTNER</conversationVendorType>
    <serviceEndpoint>{{SERVICE_ENDPOINT}}</serviceEndpoint>
    <apiVersion>61.0</apiVersion>
</ConversationVendorInfo>
```

- `developerName` / `masterLabel` / `conversationVendorType` は VoxCanvas 製品として固定
- `{{SERVICE_ENDPOINT}}` のみユーザー差し込み

### ContactCenter (可変)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ContactCenter xmlns="http://soap.sforce.com/2006/04/metadata">
    <developerName>{{CC_DEVELOPER_NAME}}</developerName>
    <masterLabel>{{CC_MASTER_LABEL}}</masterLabel>
    <conversationVendorInfo>VoxCanvas</conversationVendorInfo>
    <publicKey>{{PUBLIC_KEY_PEM}}</publicKey>
</ContactCenter>
```

### package.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>VoxCanvas</members>
        <name>ConversationVendorInfo</name>
    </types>
    <types>
        <members>{{CC_DEVELOPER_NAME}}</members>
        <name>ContactCenter</name>
    </types>
    <version>61.0</version>
</Package>
```

### レンダリング規約

- `{{KEY}}` を値に文字列置換する naïve 方式
- 値は差し込み前に XML エスケープ(`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&apos;`)
- `PUBLIC_KEY_PEM` の改行は `&#10;` に変換(要実装時検証: CDATA が使えるなら CDATA でも可)
- レンダリング先は `os.tmpdir()/voxcanvas-meta-<ulid>/` の新規ディレクトリ
- `apiVersion` は 61.0 を初期値。将来は `package.json` の `voxcanvas.metadataApiVersion` 等で一元管理できる余地を残す

### 衝突時の挙動

| 選択 | 挙動 |
|---|---|
| スキップ | deploy 自体をスキップ。既存 CC に対し別途 public key 登録は必要(ウィザード側で警告) |
| 上書き | 同名のまま deploy(Metadata API の標準動作で上書き) |
| 名前変更 | ユーザーに新しい developerName を再入力させてから deploy |

## 7. ログ設計

### ライフサイクル

1. 長時間エンドポイントで `runId = ulid()` を発行
2. `logger.open(runId, step)` で `logs/setup-<runId>.log` を作成、SSE 接続も紐付け
3. `sfRunner.run(args)` / `ngrokRunner.start()` が stdout/stderr を line-by-line でロガーへ
4. 完了時に `logger.close(runId)` でストリームクローズ
5. レスポンス末尾に `runId` を返し、UI 側が保持

### ログ行フォーマット(ファイル & SSE 共通)

```
<iso8601-utc-ms> [<step>] <LEVEL> <action> <message>
```

例:

```
2026-04-17T10:23:45.012Z [deploy]  INFO  prepare      Rendering CC XML (vendor=VoxCanvas, endpoint=https://abc.ngrok.io)
2026-04-17T10:23:45.230Z [deploy]  INFO  sf-exec      sf project deploy start --source-dir /tmp/voxcanvas-meta-01HP... --target-org myorg
2026-04-17T10:23:52.441Z [deploy]  ERROR sf-exec      exit=1 Deploy failed: INVALID_FIELD publicKey
2026-04-17T10:23:52.442Z [deploy]  HINT  hint         publicKey が空または不正の可能性。certs/jwt.pem を確認してください
```

### level / action 語彙

- `level`: `INFO` / `WARN` / `ERROR` / `HINT`
- `action`: `prepare` / `sf-exec` / `ngrok` / `hint` / `done` / `cleanup`
- 固定語彙で grep しやすさを担保

### ヒント対応表(`hints.js`)

| パターン(正規表現) | ヒント |
|---|---|
| `INVALID_TYPE.*ConversationVendorInfo` | Partner Telephony ライセンス未有効の可能性。Setup → Feature Settings → Service → Partner Telephony で有効化してください |
| `DUPLICATE_DEVELOPER_NAME` | 同名 Contact Center が既に存在します。[名前変更] または [上書き] を選択してください |
| `Permission set.*does not exist` | Partner Telephony Permission Set が未有効化。Feature Settings を確認してください |
| `You do not have access` | ログインユーザーに権限不足。System Administrator プロファイルで再ログインしてください |
| `request to .* failed` | Salesforce への接続失敗。ネットワークまたは `sf org display` で認証期限を確認してください |
| `No authorization information found for` | 指定 alias の認証切れ。`sf org login web --alias <alias>` で再ログインしてください |
| `MalformedQueryException` | `sf` CLI バージョン不一致の可能性。`sf update` で更新してください |

パターン非該当の stderr はそのまま表示(ヒントなし)。

## 8. クリーンアップ

### `/setup/complete` 時(ユーザーがチェックした項目のみ)

- `logs/setup-*.log` の削除(glob ベース)
- `os.tmpdir()/voxcanvas-meta-*` の削除(glob ベース)
- `processRegistry` 内の選択プロセスへ SIGTERM → 3 秒後に SIGKILL
- レスポンスに削除件数を含める

### サーバー停止時(shutdown hook)

- Express server の `close` イベントで `processRegistry.stopAll()` を呼び出し、ウィザードの孤児プロセスが残らないようにする

## 9. 依存関係

追加依存:

- `ulid`(v2.x): runId 生成用。小粒度で代替なし

SSE は Express の素の `res.write` で実装可能、追加 SDK 不要。
テンプレート置換は正規表現で十分、テンプレートエンジン不要。

## 10. テスト観点

以下を spec 段階で明記し、実装時に TDD で展開する。

### `metadataRenderer`

- 全プレースホルダが埋まる
- XML エスケープが効く(`<`, `&`, `"` を含む値)
- PEM の改行処理(`&#10;` or CDATA)
- 未差し込みのプレースホルダが残ったらエラー
- 一時ディレクトリ作成 + cleanup

### `sfRunner`

- 正常系: stdout を逐次 logger に流す
- exit != 0 時に error event 発火
- timeout 時の SIGTERM
- stderr のキャプチャ
- `shell: false` + 配列引数で shell メタ文字が解釈されないこと

### `hints`

- 主要パターンごとにマッチテスト
- 非該当メッセージは hint を返さない

### `processRegistry`

- 登録 / 退去検知 / 一括停止
- 既に死んでいるプロセスの kill を試みてもクラッシュしない

### API

- `localhostOnly` の 403
- 不正入力の 400(XML injection 可能な文字を含む値)
- 連続実行の冪等性(二重 deploy でも CC 上書き or スキップが選べる)
- SSE の close / reconnect

### クリーンアップ

- チェック項目のみ削除される
- 削除対象が存在しない場合もエラーにならない
- サーバー停止時に ngrok が残らない

### UI 統合テスト(手動)

- happy path: welcome → ... → complete(`.env` 内容が期待通り、CC が Salesforce 側に作成される)
- エラー系: ライセンス未付与、alias 未ログイン、同名 CC 衝突

## 11. 環境要件(README 更新)

- `sf` CLI v2.x 以降
- `ngrok` v3.x(optional。使う場合は `ngrok config add-authtoken` 済み)
- Salesforce Org: Service Cloud Voice for Partner Telephony ライセンス有効
- ログインユーザー: System Administrator 相当

## 12. ファイル変更一覧

### 新規

```
metadata/voxcanvas-contact-center/
  package.xml
  conversationVendorInfos/VoxCanvas.conversationVendorInfo-meta.xml
  contactCenters/TEMPLATE.contactCenter-meta.xml

src/server/setup/
  logger.js
  sfRunner.js
  processRegistry.js
  metadataRenderer.js
  hints.js
  ngrokRunner.js
```

### 改修

```
src/server/routes/setup.js        大幅追加
src/server/index.js                process cleanup hook 登録
src/client/js/setup-app.js         7ステップ再構成、SSE、ログパネル
src/client/setup.html              SSE/ログパネル DOM
README.md                          ウィザード中心に書き換え
package.json                       ulid 追加
```

## 13. オープンな実装時確認項目

以下は本 spec では決定せず、実装時に動作確認で決める:

1. `ContactCenter.publicKey` フィールドへの PEM 埋め込み方式(`&#10;` エスケープ vs CDATA)
2. 最新の Metadata API version(61.0 が現時点の初期値、実装時に最新確認)
3. `sf org assign permset` の target-user 指定構文(username 直接 vs Id)
4. `ContactCenter` メタデータへの public key 埋め込みが deploy 時に即反映されるか(反映されない場合、別途 Tooling API で更新する後続処理が必要)
5. ngrok の管理 API の版差異(v3 系想定だが URL 取得エンドポイントが変わる可能性)
6. `ContactCenter` メタデータでの vendor 参照フィールド名(本 spec では `conversationVendorInfo` と仮置き、実装時に公式メタデータリファレンスで確認)
7. `ContactCenter` XML の `developerName` と実行時の API Name(`CALL_CENTER_API_NAME`) の対応(namespace prefix が付くか等)

各項目は plan 段階で「調査タスク」として切り出すか、実装中にヒット時に判断する。

## 14. Out of scope / 将来拡張

- Step 5 完了後に Omni-Channel 設定を案内する軽量ガイドページ(実装ではなくリンク集)
- ngrok 以外のトンネル(cloudflared 等)対応
- Scratch Org 作成ウィザード統合
- CI 用 headless モード(CLI 単体から全部回す `npm run setup:auto`)
