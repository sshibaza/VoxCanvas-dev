# VoxCanvas プロジェクト引き継ぎドキュメント

## ─ Partner Telephony擬似環境構築の全記録 ─

**作成日**: 2026年4月16日
**目的**: 設計を別の場所で再開するための情報集約
**プロジェクト名**: VoxCanvas (Control UI) / Partner Telephony Demo Environment

---

## Part 1: プロジェクトの背景と目的

### 1.1 大目的

Salesforce Service Cloud Voice (SCV) を、**Amazon Connect環境なしで** Partner Telephony として擬似的に動作させ、顧客デモに使える環境を構築する。

### 1.2 ビジネス文脈

- Salesforce FDEの業務における顧客デモ用途
- Amazon Connectを気軽に用意できない状況が多い
- Partner Telephonyのデモ需要が高い
- Agentforce Voiceは日本未提供 (2026年4月時点、米国・カナダのみ) のため、Partner Telephonyが代替手段

### 1.3 ユーザーの要件（Part 2で詳細化）

1. ✅ Salesforce組織 + Service Console + Omni-Channel Available
2. ✅ Web UIから発信元/発信先番号指定で「発信」→ Service Consoleオペレータに接続
3. ✅ Voice Callオブジェクトで通話管理
4. ✅ UIチャット → 文字起こしデータ → ConversationEntry格納 → Service Console表示
5. ✅ オペレータと発信者の両方のチャット送信で双方向会話再現

---

## Part 2: 要件・要望まとめ

### 2.1 機能要件

| # | 要件 | 優先度 |
|---|------|--------|
| F1 | Web UI から発信元/発信先電話番号指定で「発信」ボタンクリック | 必須 |
| F2 | 着信/発信両方のシミュレーション | 必須 |
| F3 | Salesforce Service Consoleにコールポップ表示、エージェントが受付可能 | 必須 |
| F4 | Voice Callオブジェクトで通話情報を管理 | 必須 |
| F5 | UIチャット → SalesforceのConversationEntryに格納 | 必須 |
| F6 | オペレータ(エージェント)発話と発信者(顧客)発話の両方をUIから送信 | 必須 |
| F7 | Service Console上で双方向会話として表示 | 必須 |
| F8 | リアルタイム文字起こし送信 | 必須 |
| F9 | 通話録音のアップロード | 必須 |
| F10 | ボイスメール送信 | 必須 |
| F11 | エージェントステータス切替 | 除外 |
| F12 | CTR Sync (マルチパーティ通話終了) | 除外 |
| F13 | 複数コール同時管理 | 除外 (後に「複数通話切替」として一部実装) |
| F14 | コール履歴・統計ダッシュボード | 除外 |

### 2.2 非機能要件

| # | 要件 |
|---|------|
| N1 | AWS/Amazon Connect不要 |
| N2 | 配布形態: GitHubリポジトリにPush、誰でも再現可能 |
| N3 | セットアップが複雑でないこと |
| N4 | デザインはモダンでクリーンなSaaS風 |
| N5 | カラーはSalesforce / Agentforce のパレット中心 |
| N6 | テキストで会話を擬似的に再現する方式でOK (実VoIPは不要) |
| N7 | プロジェクト名: VoxCanvas |

### 2.3 回答スタイル要件 (ユーザー指定)

- 超一流のコンサルタントとして、正確で徹底的な調査・分析
- 構造化されたわかりやすい文章
- 最優先は回答の正確性、ユーザ指示を忠実に実行
- ソースを必ず提供

---

## Part 3: ユーザー環境情報

### 3.1 Salesforce CLI バージョン

- `@salesforce/cli` v2.124.7 (更新推奨: v2.130.9)

### 3.2 動作環境の前提

- Node.js 18以上がインストールされた一般的なPC (Windows/macOS/Linux いずれも可)
- モダンブラウザ (Chrome/Edge/Safari/Firefox)
- 特別なハードウェア要件なし

---

## Part 4: 参考リポジトリ徹底調査結果 (2026年4月時点・最新)

### 4.1 調査結論サマリ

**byo-demo-connector は現時点で唯一の最新・アクティブメンテされている公式デモコネクタ**である。他の類似リポジトリはすべて以下のいずれかに該当:
- byo-demo-connector に統合済み (旧 byoc-ott-demo-app)
- 廃止/非推奨化 (salesforce/demo-scv-connector)
- 補助ツール (SDK、サンプルコード集、Lambda)

Service Cloud Voice + Partner Telephony + Messaging CCaaS の全体を一つで扱う**統合型デモ環境**は `salesforce-misc/byo-demo-connector` のみ。

### 4.2 公式リポジトリ一覧 (2026年4月時点の状態付き)

#### [A] メインのデモコネクタ

| # | リポジトリ | 状態 | 用途 |
|---|-----------|------|------|
| 1 | **`salesforce-misc/byo-demo-connector`** ⭐推奨 | **アクティブ (2025年末もコミット継続)** | Voice + Messaging + BYOC CCaaS + BYOB 統合デモ |

**重要な事実**:
- 以前は Voice (`demo-scv-connector`) と Messaging (`byoc-ott-demo-app`) の2リポジトリに分かれていたが、**2024-2025年に `byo-demo-connector` へ統合**
- Salesforce公式の「BYOC for CCaaS」「BYOC for Messaging」「Partner Telephony」のすべてのドキュメントがこのリポジトリを参照している
- Apache-2.0ライセンス、公開リポジトリ

#### [B] SDK・ベース連携ライブラリ

| # | リポジトリ | 状態 | 用途 |
|---|-----------|------|------|
| 2 | `salesforce/scv-connector-base` | アクティブ (npm v4.7.11, 2025年リリース) | Partner Telephonyコネクタ開発用SDK (npmパッケージ `@salesforce/scv-connector-base`) |
| 3 | `salesforce/scv-partner-telephony-quickstart` | 存続 | Managed Package用のQuickstartテンプレート。submoduleとして `demo-connector` を含む |

#### [C] サンプルコード・Contact Flow集

| # | リポジトリ | 状態 | 用途 |
|---|-----------|------|------|
| 4 | `service-cloud-voice/examples-from-doc` | **アクティブ (2025-12にコミット、138 commits)** | Contact Flow・Toolkit APIサンプル・Call Center XMLテンプレート |
| 5 | `service-cloud-voice/ServiceCloudVoiceLambdas` | アクティブ (2025-12にコミット) | Amazon Connect向けLambda関数 (AWS必須のため今回不要) |

#### [D] Amazon Connect連携 (今回対象外、参考情報)

| # | リポジトリ | 状態 | 用途 |
|---|-----------|------|------|
| 6 | `amazon-connect/amazon-connect-salesforce-scv` | 存続 | Amazon ConnectでのSCV追加実装例集 |

#### [E] 関連APIスキーマ

| # | リポジトリ | 状態 | 用途 |
|---|-----------|------|------|
| 7 | `salesforce-misc/interaction-service-apis` | アクティブ | BYOC CCaaS/MessagingのInteraction Service APIスキーマとcURLサンプル |

#### [F] 廃止/非推奨

| # | リポジトリ | 状態 | 用途 |
|---|-----------|------|------|
| 8 | ~~`salesforce/demo-scv-connector`~~ | **非推奨** | Voice専用の旧デモコネクタ。byo-demo-connectorに統合済み |
| 9 | ~~`salesforce-misc/byoc-ott-demo-app`~~ | **移行済み** | Messaging用の旧デモ。byo-demo-connectorに統合済み |

### 4.3 結論と推奨

**`salesforce-misc/byo-demo-connector` を引き続き基盤として使用するのが最適解**。理由:

1. ✅ Salesforce公式ドキュメントがすべてこのリポジトリを参照
2. ✅ 2025年末時点でアクティブにメンテナンスされている唯一のデモコネクタ
3. ✅ Voice + Messaging + BYOC CCaaS 全てに対応
4. ✅ SCV Partner Telephony Dev Guide が直接このリポジトリを指定している
5. ❌ これより新しい/汎用的なデモコネクタは存在しない

**補助的に活用すべきリポジトリ**:
- `service-cloud-voice/examples-from-doc`: Call Center XMLテンプレートとContact Flowサンプル
- `salesforce/scv-connector-base`: 独自コネクタ開発時のSDK (npm)
- `salesforce-misc/interaction-service-apis`: Messaging CCaaS Interaction Service APIのテスト用

---

## Part 5: 発生した問題と対処 (時系列)

### 問題1: Contact Center XMLアップロード失敗

**症状**: Partner Telephony Setupウィザードで「XML ファイル内のベンダー名は、選択したベンダーの名前に一致する必要があります」エラー。

**原因**:
`reqVendorInfoApiName` の値と `ConversationVendorInfo` の `DeveloperName` 一致確認だけでは不十分。UIウィザードはベンダーごとのXMLスキーマ厳密チェックを行う。VoxCanvasベンダーのConversationVendorInfoが非標準経路で作成されており (フォルダ名が `conversationVendorInfo/` と非標準)、UIウィザードが期待する構造と整合していなかった。

**対処**:
UIウィザードをバイパスし、Metadata API経由でCallCenterを直接デプロイする方法を提案:
```bash
sf project deploy start \
  --source-dir force-app/main/default/callCenters/VoxCanvas_Demo.callCenter-meta.xml \
  --target-org CCPF-New
```

**教訓**:
- エラーメッセージが誤解を招くことがある (「ベンダー名一致」ではなく実際はスキーマ整合性)
- カスタムベンダーではMetadata API経由デプロイが確実

---

### 問題2: Salesforce CLIコマンド非推奨

**症状**: `sfdx force:org:create` 等のコマンドが廃止済み。

**原因**: 2024年6月に`sfdx`系コマンドが非推奨化、2024年6月12日にリファレンスから削除。

**対処**: すべて`sf` CLI v2構文に統一:
```bash
sf org create scratch --definition-file ... --alias ...
sf org login web --alias ...
sf org list
sf project retrieve start --metadata CallCenter --target-org ...
sf project deploy start --source-dir ... --target-org ...
sf data query --query "..." --target-org ...
```

---

### 問題3: `sf project retrieve start` がプロジェクト外で失敗

**症状**: `InvalidProjectWorkspaceError: /Users/sshibazaki does not contain a valid Salesforce DX project`

**原因**: `sf project retrieve start` はSFDXプロジェクトディレクトリ内でしか実行できない。

**対処**:
```bash
sf project generate --name voxmirage
cd voxmirage
sf project retrieve start --metadata CallCenter --target-org CCPF-New
```

---

### 問題4: メタデータ型名の誤り

**症状**: `Missing metadata type definition in registry for id 'ConversationVendorInformation'`

**原因**: メタデータ型名が紛らわしい:
- ✅ 正: `ConversationVendorInfo`
- ❌ 誤: `ConversationVendorInformation`

**対処**: 正しい型名 `ConversationVendorInfo` で再実行。

---

### 問題5: Contact CenterにユーザーをAddできない (BYOT権限セット問題)

**症状**: Contact Center Users ダイアログで「Contact Center Admin BYOT or Contact Center Agent BYOT permission sets」が必要とのメッセージ。ユーザー選択肢が空。

**原因**: UIメッセージは古い用語「BYOT」を参照しているが、組織に存在する正しい権限セット名は **Partner Telephony付き** のもの。

**対処**:
```bash
# 正しい権限セットをユーザーに付与
sf org assign permset --name ContactCenterAdminExternalTelephony --target-org CCPF-New
sf org assign permset --name ContactCenterAgentExternalTelephony --target-org CCPF-New
```

対応表:

| UIメッセージ | 実際の権限セット名 (Name) | Label |
|------------|-----------------------|-------|
| Contact Center Admin BYOT | `ContactCenterAdminExternalTelephony` | Contact Center Admin (Partner Telephony) |
| Contact Center Agent BYOT | `ContactCenterAgentExternalTelephony` | Contact Center Agent (Partner Telephony) |

---

### 問題6: byo-demo-connectorの `/ccaas` 画面にVoiceタブが表示されない

**症状**: `https://127.0.0.1:8080/ccaas` にアクセスしてもMessagingタブのみ表示。Voiceタブが見えない。

**原因調査**:
1. `.env` 設定は正しい (Voice専用最小構成)
2. `ccaas.html` のVoiceタブは HTMLに `class="slds-hide"` で初期非表示
3. JavaScript側で Salesforceコネクタから初期化イベント受信時にのみVoiceタブ表示フラグON
4. 初期化APIは `/api/configureTenantInfo`
5. この初期化はSalesforce Service ConsoleのOmni-Channel Utility内iframe経由でコネクタがロードされた時にのみ発生
6. ユーザー側では権限セット問題でContact Center Userに追加できていなかったため、初期化フローが走らず

**根本原因の連鎖**:
```
BYOT権限セット未付与
  ↓
Contact Center Userにユーザー追加できない
  ↓
Service ConsoleでOmni-Channel Utility経由でコネクタが初期化されない
  ↓
/api/configureTenantInfo が呼ばれない
  ↓
/ccaas のVoiceタブが非表示のまま
```

**対処**:
- 権限セット付与 (問題5の対処)
- 既存UIに依存するのではなく、**独自UIを作成する方針に転換** (Part 6へ)

**別AIの誤った回答への対処**:
別のAIが「Voice用Remote Control UIは存在しない」と誤った主張をしたが、公式READMEの事実確認により **`/ccaas` 画面にVoiceタブが存在することを確認済み**。ただしユーザー環境では表示条件を満たしていなかったため、独自UI構築が最適解と判断。

---

### 問題7: Tailwind CDNのProduction警告

**症状**: ブラウザコンソールに「cdn.tailwindcss.com should not be used in production」警告。

**評価**: エラーではない注意喚起。デモ/プロトタイプ用途では問題なし。

**対処**: 現状のままで問題なし。将来GitHub Pages等でライブデモ公開する場合のみビルドステップ導入を検討。

---

## Part 6: 最終的な設計方針

### 6.1 アプローチ

既存のDemo Connector UI (`/ccaas`) をバイパスし、**独自のモダンUI** を `public/voxcanvas.html` として作成。既存の byo-demo-connector サーバー (`/api/*`) をそのまま活用。

### 6.2 コア機能: Dual-Window モード

```
┌───────────────────────┬───────────────────────┐
│  👤 CUSTOMER VIEW      │  🎧 AGENT VIEW        │
│  (オレンジ系グラデ)     │  (ブルー系グラデ)      │
│                       │                       │
│  顧客として発言する     │  エージェントとして応答│
│  独立した入力欄         │  独立した入力欄         │
│  独立したクイックフレーズ│  独立したクイックフレーズ│
│  独立した送信ボタン     │  独立した送信ボタン     │
└───────────────────────┴───────────────────────┘
            ↓ 同時送信                 ↓
          Salesforce Service Console
          (Enhanced Conversation表示)
```

### 6.3 画面フロー

**Step 1: 通話開始スクリーン**
- 着信 or 発信を選択
- 顧客番号とコンタクトセンター番号を入力
- 「通話を開始」→ `/api/createVoiceCall` → Dual-Window遷移

**Step 2: Dual-Windowモード**
- 左右ペインで独立してチャット
- 送信すると `/api/createTranscription` に speaker (CUSTOMER/AGENT) を指定してPOST
- 両ペインに即座反映、Salesforceにも送信

**Step 3: オプションツール**
- 通話録音アップロード: `/api/updateVoiceCall`
- ボイスメール送信: `/api/sendVoiceMail`

### 6.4 UX工夫

| 要素 | 工夫 |
|------|------|
| 配色 | 顧客=オレンジ、エージェント=ブルーで視覚的に区別 |
| メッセージバブル | チャットアプリ風 (自分の発言は右揃え、相手は左揃え) |
| クイックフレーズ | 一般的な問い合わせ対応の定型句を各ロールに用意 |
| キーボード | ⌘/Ctrl+Enter で送信 |
| ヘッダー | サーバーステータスをリアルタイムパルス表示 |
| ログ | ドロワー形式で必要時のみ表示 |

### 6.5 技術スタック

| 項目 | 採用技術 |
|------|---------|
| フレームワーク | React 18 (CDN経由) |
| スタイル | Tailwind CSS (CDN) + カスタムCSS |
| フォント | Manrope (本文) / JetBrains Mono (コード) |
| ビルド | 不要 (単一HTMLファイル) |
| ホスト | byo-demo-connectorの webpack-dev-server (ポート8080) |

### 6.6 カラーパレット

| 用途 | HEX |
|------|-----|
| Agent Primary | `#0176D3` (Salesforce Blue) |
| Agent Dark | `#014486` (Salesforce Navy) |
| Customer Primary | `#FE9339` (Salesforce Orange) |
| Customer Dark | `#C86B1A` |
| Brand Gradient開始 | `#032D60` (Salesforce Navy) |
| Brand Gradient終点 | `#00A1E0` (Salesforce Sky) |
| Success | `#2E844A` |
| Error | `#BA0517` |

---

## Part 7: 既存実装の状態

### 7.1 完成している成果物

1. **`voxcanvas.html`** (約1400行、58KB): Dual-Window UIの完全実装
2. **`README.md`**: セットアップ・デモフロー・トラブルシューティング含む

### 7.2 既知の課題

| # | 課題 |
|---|------|
| K1 | Tailwind CDN警告 (実害なし) |
| K2 | Enhanced Conversationコンポーネントの配置は手動 (Lightning App Builder) |
| K3 | 複数通話切替は実装済みだが、UXは要改善 |
| K4 | ログドロワーは右スライドイン形式、デスクトップで好評だがモバイル要確認 |
| K5 | プロジェクトは単一HTMLのため、将来の機能追加時にファイル肥大化リスク |

### 7.3 Salesforce側の前提設定

- Contact Center作成済み: VoxCanvas_Partner_Telephony ベンダー利用
- 権限セット付与: `ContactCenterAdminExternalTelephony` / `ContactCenterAgentExternalTelephony`
- Contact Center User追加
- Phoneチャネル付きPresence Status作成 (例: Available for Phone)
- Omni-Channel Utility を Service Console アプリに追加

### 7.4 デモフロー

```
[準備]
1. byo-demo-connector を npm start で起動
2. Salesforce Service ConsoleでOmni-Channel Utility開く
3. ステータスを Available for Phone に

[デモ実行]
4. VoxCanvas Controlを開く (https://127.0.0.1:8080/voxcanvas.html)
5. 発信者番号 + 着信番号を入力 → 「通話を開始」
6. Service Console側にコールポップ → Accept
7. VoxCanvas Controlの左ペイン(顧客)で発言
8. VoxCanvas Controlの右ペイン(エージェント)で応答
9. Service ConsoleのVoice Call レコードで会話が表示される
10. (オプション) 通話録音・ボイスメール送信
11. 「通話終了」で閉じる
```

---

## Part 8: 設計をやり直す際のチェックリスト

### 8.1 要件再確認

- [ ] F1-F10 の機能要件すべてを満たすか
- [ ] N1-N7 の非機能要件を満たすか
- [ ] デモフロー全ステップを実行可能か

### 8.2 確認しておくべき事実

- [ ] byo-demo-connector の `/api/*` エンドポイント仕様
- [ ] SCRT2 API がConversationEntryを生成する仕組み
- [ ] Enhanced Conversationコンポーネントの表示要件
- [ ] Contact Center XMLの必須フィールド (`reqTelephonyIntegrationCertificate` 等)

### 8.3 設計の代替案

| 観点 | 現状 | 代替案 |
|------|------|-------|
| UIフレームワーク | React (CDN) | Svelte / Vue / Vanilla JS |
| スタイル | Tailwind CDN | カスタムCSS / SLDS直接使用 |
| ファイル構成 | 単一HTML | マルチファイル (要ビルドステップ) |
| ホスト | byo-demo-connector | 独立Nodeサーバー |
| 配布 | GitHub直Push | GitHub Pages / Vercel |

### 8.4 避けるべき落とし穴

1. ❌ `sfdx` コマンドを使う (非推奨)
2. ❌ メタデータ型名を `ConversationVendorInformation` と書く (正: `ConversationVendorInfo`)
3. ❌ Contact Center XMLアップロードをUI経由で試す (Metadata APIが確実)
4. ❌ `localhost:8080` を使う (CORSエラー、`127.0.0.1:8080`必須)
5. ❌ BYOT権限セットという名前を探す (実際は `Partner Telephony` 付き)
6. ❌ 別AIの不正確な情報 (「Voice用Remote Control UIなし」等) を鵜呑みにする
7. ❌ Voice機能初期化には `/api/configureTenantInfo` が必要、Salesforce iframe経由でしか自動発火しない
8. ❌ 旧リポジトリ `salesforce/demo-scv-connector` / `salesforce-misc/byoc-ott-demo-app` を使う (すべて byo-demo-connector に統合済み)

---

## Part 9: キーとなるソースコード / 設定

### 9.1 byo-demo-connector の `.env` (Voice専用最小構成)

```bash
SERVER_PORT=3030
SERVER_URL=http://localhost:3030
CALL_CENTER_NO=4150000000
# OVERRIDE_VOICECALLID=0LQxx0000004C92GAE  # SCRT2バイパス用
```

### 9.2 Contact Center XML (VoxCanvas用最小版)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CallCenter xmlns="http://soap.sforce.com/2006/04/metadata">
    <displayName>VoxCanvas Demo Contact Center</displayName>
    <sections>
        <items>
            <label>InternalName</label>
            <n>reqInternalName</n>
            <value>VoxCanvasDemoCC</value>
        </items>
        <items>
            <label>Display Name</label>
            <n>reqDisplayName</n>
            <value>VoxCanvas Demo Contact Center</value>
        </items>
        <items>
            <label>Conversation Vendor Info Developer Name</label>
            <n>reqVendorInfoApiName</n>
            <value>VoxCanvas_Partner_Telephony</value>
        </items>
        <label>General Information</label>
        <n>reqGeneralInfo</n>
    </sections>
    <sections>
        <items>
            <label>Telephony Integration Certificate</label>
            <n>reqTelephonyIntegrationCertificate</n>
            <value>-----BEGIN CERTIFICATE-----
（cert.pem内容）
-----END CERTIFICATE-----</value>
        </items>
        <items>
            <label>Long Distance Prefix</label>
            <n>reqLongDistPrefix</n>
            <value>+81</value>
        </items>
        <label>SCV Settings</label>
        <n>reqHvcc</n>
    </sections>
    <version>20.1</version>
</CallCenter>
```

参考: [公式サンプル CC XML](https://github.com/service-cloud-voice/examples-from-doc/blob/main/callcenter/partner_telephony_cc_import.xml)

### 9.3 byo-demo-connector のAPIエンドポイント一覧

| エンドポイント | メソッド | 用途 |
|-------------|--------|-----|
| `/api/createVoiceCall` | POST | VoiceCallレコード作成 (着信/発信シミュレーション) |
| `/api/updateVoiceCall` | POST | 通話状態更新・録音URL登録 |
| `/api/createTranscription` | POST | リアルタイム文字起こし送信 |
| `/api/configureTenantInfo` | POST | テナント情報設定 (初期化) |
| `/api/sendVoiceMail` | POST | ボイスメール送信 |
| `/api/sendRealtimeConversationEvents` | POST | リアルタイム会話イベント送信 |

### 9.4 リクエスト例: 着信シミュレーション

```javascript
fetch('/api/createVoiceCall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        callType: 'inbound',
        from: '090-1234-5678',
        to: '0120-000-000',
    }),
});
```

### 9.5 リクエスト例: 文字起こし送信

```javascript
fetch('/api/createTranscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        vendorCallKey: 'call-xxx-yyy',
        speaker: 'CUSTOMER',  // or 'AGENT'
        text: '口座残高を確認したいのですが。',
        timestamp: Date.now(),
    }),
});
```

---

## Part 10: 成果物ファイル一覧

| ファイル | 配置先 | 説明 |
|---------|-------|------|
| `voxcanvas.html` | `byo-demo-connector/public/` | 本体HTML (React/Tailwind) |
| `README.md` | プロジェクトルート | セットアップ・デモ手順 |
| (参考) `SCV_Partner_Telephony_完全ガイド_v2.md` | docs | Partner Telephony全体の詳細レポート |
| (参考) `PartnerTelephony_ContactCenter_XML_Troubleshooting.md` | docs | XMLアップロードエラーの切り分けレポート |

---

## Part 11: 次のステップ (設計やり直し時に検討)

### 11.1 優先度高

1. **UX改善**: 通話開始から会話までの導線をさらに滑らかに
2. **Enhanced Conversation の自動配置**: Lightning App Builder手動操作をスクリプト化できないか
3. **デモシナリオのプリセット**: 典型的な問い合わせシナリオ (問い合わせ、予約、苦情対応など) をボタン一発でロード

### 11.2 中期で検討

1. **シナリオ録画/再生機能**: デモの流れを保存して再生可能に
2. **AI補助**: Agentforceと連携して応答候補を表示
3. **多言語対応**: 英語UIも提供

### 11.3 技術的改善

1. **Tailwind ビルド化**: Production警告を消すが、シンプルさとのトレードオフ
2. **マルチファイル化**: コンポーネント分割で保守性向上
3. **TypeScript化**: 大規模化を見据えて

---

## 付録A: コマンドチートシート

```bash
# 組織ログイン
sf org login web --alias CCPF-New

# 組織一覧
sf org list

# CallCenter一覧 (SOQL)
sf data query \
  --query "SELECT Id, Name, InternalName, AdapterUrl FROM CallCenter" \
  --target-org CCPF-New

# ConversationVendorInfo一覧 (SOQL)
sf data query \
  --query "SELECT Id, DeveloperName, MasterLabel, NamespacePrefix, ConnectorUrl FROM ConversationVendorInfo" \
  --target-org CCPF-New

# メタデータ取得 (プロジェクト内で実行)
sf project retrieve start --metadata CallCenter --target-org CCPF-New
sf project retrieve start --metadata ConversationVendorInfo --target-org CCPF-New

# 権限セット付与
sf org assign permset --name ContactCenterAdminExternalTelephony --target-org CCPF-New
sf org assign permset --name ContactCenterAgentExternalTelephony --target-org CCPF-New

# CallCenterデプロイ
sf project deploy start \
  --source-dir force-app/main/default/callCenters/VoxCanvas_Demo.callCenter-meta.xml \
  --target-org CCPF-New

# byo-demo-connector 起動
cd ~/scv-demo/byo-demo-connector
npm start
# https://127.0.0.1:8080/voxcanvas.html でアクセス
```

---

## 付録B: 参考リンク集

### 公式リポジトリ (最新・推奨)

- **メイン**: https://github.com/salesforce-misc/byo-demo-connector
- SDK: https://github.com/salesforce/scv-connector-base (npm: `@salesforce/scv-connector-base`)
- Quickstart: https://github.com/salesforce/scv-partner-telephony-quickstart
- Contact Flowサンプル: https://github.com/service-cloud-voice/examples-from-doc
- Interaction Service API: https://github.com/salesforce-misc/interaction-service-apis

### 廃止/非推奨 (使用しないこと)

- ~~https://github.com/salesforce/demo-scv-connector~~ → byo-demo-connectorに統合
- ~~https://github.com/salesforce-misc/byoc-ott-demo-app~~ → byo-demo-connectorに統合

### 公式ドキュメント

- Service Cloud Voice for Partner Telephony Dev Guide: https://developer.salesforce.com/docs/atlas.en-us.voice_pt_developer_guide.meta/voice_pt_developer_guide/voice_pt_dev_guide.htm
- Demo Connector利用ガイド: https://developer.salesforce.com/docs/atlas.en-us.voice_pt_developer_guide.meta/voice_pt_developer_guide/voice_pt_demo_connector.htm
- Real-Time Transcription: https://developer.salesforce.com/docs/atlas.en-us.voice_pt_developer_guide.meta/voice_pt_developer_guide/voice_pt_transcribe_calls.htm
- Bring Your Own Channel for CCaaS: https://developer.salesforce.com/docs/service/messaging-byoc-ccaas/guide/introduction.html
- Bring Your Own Channel for Messaging: https://developer.salesforce.com/docs/service/messaging-partner/guide/introduction.html

---

**このドキュメントで、別の場所でも本プロジェクトの設計を再開できる情報が揃っています。**
