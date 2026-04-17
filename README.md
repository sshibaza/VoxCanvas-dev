# VoxCanvas v2

Salesforce Service Cloud Voice (Partner Telephony) demo environment.
Simulate voice calls, real-time transcription, and voicemail without Amazon Connect.

## Quick Start

```bash
git clone [<repo-url>](https://github.com/sshibaza/VoxCanvas-dev.git) && cd voxcanvas
npm install
npm run init      # Generate certificates
npm run dev       # Start development server
```

**First run?** Launch the Setup Wizard at `http://127.0.0.1:5173/setup.html` — or simply **double-click `setup.html` in the project root** to open a launcher page that takes you there. After the wizard finishes, the dashboard is at `http://127.0.0.1:5173/`. Production builds (`npm run build && npm start`) serve both routes over `https://127.0.0.1:3030`.

## Setup

Setup Wizard が `sf` CLI を呼び出して Contact Center 作成・Permission Set 割り当て・.env 書き出しまで完結させます。

### 前提

- `sf` CLI v2.x 以降(`sf --version` で確認)
- `ngrok` v3.x(optional、Salesforce から VoxCanvas に到達させる tunnel 用。`ngrok config add-authtoken <token>` 済みであること)
- 対象 Salesforce Org:
  - Service Cloud Voice for Partner Telephony ライセンス有効
  - ログインユーザーが System Administrator 相当

### 手順

```bash
npm install
npm run dev
```

ブラウザで `http://127.0.0.1:5173/setup.html` を開き、ウィザードに従って以下を実行:

1. **Welcome** — 環境チェック(node / sf / openssl / ngrok)
2. **Certificate** — HTTPS + JWT 証明書を生成
3. **Org** — `sf` 既定 Org を使用 or 別の alias を選択 or 新規ログイン
4. **Contact Center** — ngrok 起動 + Contact Center 名を入力 → Deploy
5. **Permissions** — Admin + Agent permset を割り当て
6. **Connect** — 設定サマリの疎通確認
7. **Verify** — 設定サマリ確認 + cleanup 実行 + `.env` 保存

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
