# VoxCanvas v2

Salesforce Service Cloud Voice (Partner Telephony) demo environment.
Simulate voice calls, real-time transcription, and voicemail without Amazon Connect.

## Quick Start

```bash
git clone https://github.com/sshibaza/VoxCanvas-dev.git && cd voxcanvas
npm install
npm run init      # Generate certificates
npm run dev       # Start development server
```

**First run?** Launch the Setup Wizard at `http://127.0.0.1:5173/setup.html` — or simply **double-click `setup.html` in the project root** to open a launcher page that takes you there. After the wizard finishes, the dashboard is at `http://127.0.0.1:5173/`. Production builds (`npm run build && npm start`) serve both routes over `https://127.0.0.1:3030`.

## Setup

Setup Wizard が `sf` CLI を呼び出して vendor metadata のデプロイ・Permission Set 割り当て・.env 書き出しまで自動化します。ContactCenter レコード本体は Salesforce の API 制約により Setup UI からの手動作成となりますが、ウィザードが DeveloperName で自動検出して次ステップへ進みます。

### 前提

- `sf` CLI v2.x 以降(`sf --version` で確認)
- 対象 Salesforce Org:
  - Service Cloud Voice for Partner Telephony ライセンス有効
  - ログインユーザーが System Administrator 相当
- `ngrok` v3.x は **optional**。Tunnel mode を使う場合のみ必要(下表参照)

### Endpoint mode

Step 4 の Contact Center 作成時に 2 通りの serviceEndpoint から選びます:

| Mode | Service Endpoint | 想定シナリオ | 前提 |
|---|---|---|---|
| **Local(デフォルト)** | `https://127.0.0.1:3030/` | FDE が自 Mac で Salesforce Lightning と VoxCanvas を両方動かして画面共有するデモ | 自己署名証明書を 1 度受理するだけ |
| **Tunnel** | `https://xxxx.ngrok.io/` (自動取得) | 別 PC の同僚を agent としてリモート参加させる | `ngrok` + authtoken の事前設定 |

ConversationVendorInfo.serviceEndpoint は Salesforce サーバーではなく **agent のブラウザが iframe でロードする URL** なので、agent と VoxCanvas が同じマシンなら 127.0.0.1 で到達できます(ngrok 不要)。

### 手順

```bash
npm install
npm run dev
```

ブラウザで `http://127.0.0.1:5173/setup.html` を開き、ウィザードに従って以下を実行:

1. **Welcome** — 環境チェック(node / sf / openssl / ngrok)
2. **Certificate** — HTTPS + JWT 証明書を生成
3. **Org** — `sf` 既定 Org を使用 or 別の alias を選択 or 新規ログイン
4. **Contact Center** — Endpoint mode を選択(Local or Tunnel)→ Deploy(vendor metadata)→ 画面の指示に従って Setup → Contact Centers → New から ContactCenter を作成 → Verify
5. **Permissions** — Admin + Agent permset を割り当て
6. **Connect** — 設定サマリの疎通確認
7. **Verify** — 設定サマリ確認 + cleanup 実行 + `.env` 保存

Local mode を使う場合、Step 4 で「Re-check」が促されたら `https://127.0.0.1:3030/` を新しいタブで開いて自己署名証明書の警告を 1 度受理してください。

### 完了後

```bash
npm start   # 本番モード(HTTPS、port 3030)
```

### 手動実行が必要な項目(自動化対象外)

- Service Console に Omni-Channel Utility を追加
- Presence Status "Available for Phone" を作成
- Voice Call レコードページに Enhanced Conversation を配置

これらは Lightning App Builder で実施してください。

## Demo Flow

1. Open VoxCanvas Dashboard (`http://127.0.0.1:5173` in dev, or `https://127.0.0.1:3030` for production)
2. In Salesforce: Omni-Channel → Set status to "Available for Phone"
3. VoxCanvas: Select Inbound/Outbound → Enter phone numbers → **Start Call**
4. Salesforce: Accept the incoming call
5. VoxCanvas: Type in Customer panel (left) and Agent panel (right) — press Enter to send
6. Watch messages appear in Salesforce Enhanced Conversation
7. (Optional) Attach a recording URL or send voicemail from Tools panel
8. **End Call** to finish

## Important Notes

- Use `127.0.0.1` (not `localhost`) when adding the callback/CORS origin on the Salesforce side — the SCRT2 CORS allowlist expects an explicit host
- Accept the self-signed certificate warning on first visit to the Node HTTPS server
- Permission set names use "Partner Telephony" not "BYOT"
- VoxCanvas does not use a Connected App or External Client App. The Partner Telephony voice path signs JWTs with the private key whose matching public key is registered directly on the Contact Center record — no OAuth Consumer Key is required.
- `ConversationVendorInfo` metadata has no Setup UI; it must be deployed via Metadata API (`sf project deploy start`)
- Metadata type is `ConversationVendorInfo` (not `ConversationVendorInformation`)
- The Setup Wizard endpoints (`/api/setup/*`) only respond to loopback (127.0.0.1) by design

## Tech Stack

- **Server:** Node.js + Express
- **Frontend:** Vite + Vanilla JS + Tailwind CSS
- **Auth:** JWT Bearer Token (RSA 2048-bit)
- **Salesforce API:** SCRT2 (Service Cloud Real-Time)

## Project Structure

```
src/server/     Express server, API routes, SCRT2 client
src/client/     Dashboard UI, Setup Wizard
scripts/        Setup automation
certs/          Generated certificates (gitignored)
```

## License

MIT
