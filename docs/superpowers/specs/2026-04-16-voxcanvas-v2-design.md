# VoxCanvas v2 Design Specification

**Date**: 2026-04-16
**Project**: VoxCanvas — Salesforce Service Cloud Voice (Partner Telephony) Demo Environment
**Status**: Approved

---

## 1. Overview

### 1.1 Purpose

Salesforce Service Cloud Voice (SCV) を Amazon Connect 環境なしで Partner Telephony として擬似的に動作させ、顧客デモに使えるローカル環境を構築する。

### 1.2 Background

- Salesforce FDE の業務における顧客デモ用途
- Amazon Connect を気軽に用意できない状況が多い
- Agentforce Voice は日本未提供（2026年4月時点）のため、Partner Telephony が代替手段
- 前バージョン（v1）は byo-demo-connector に同梱した単一 HTML ファイルで構築されていた

### 1.3 v2 で解決する v1 の課題

| v1 の課題 | v2 での解決 |
|---|---|
| 単一 HTML（約1400行）による肥大化 | Vite + コンポーネント分割 |
| Tailwind CDN の Production 警告 | ビルドパイプラインに統合 |
| byo-demo-connector への依存（上流追従困難） | 独立プロジェクトとして再構築 |
| 画面遷移（通話開始→Dual-Window） | ダッシュボード型 Single Screen |
| セットアップが手動で複雑 | ブラウザベースのセットアップウィザード |
| Messaging 等の不要機能が含まれる | Voice 特化でスリム化 |

---

## 2. Requirements

### 2.1 Functional Requirements

| # | Requirement | Priority |
|---|---|---|
| F1 | Web UI から発信元/発信先電話番号指定で発信 | Must |
| F2 | 着信/発信両方のシミュレーション | Must |
| F3 | Salesforce Service Console にコールポップ表示、エージェントが受付可能 | Must |
| F4 | Voice Call オブジェクトで通話情報を管理 | Must |
| F5 | UI チャット → Salesforce の ConversationEntry に格納 | Must |
| F6 | オペレータ発話と発信者発話の両方を UI から送信 | Must |
| F7 | Service Console 上で双方向会話として表示 | Must |
| F8 | リアルタイム文字起こし送信 | Must |
| F9 | 通話録音のアップロード | Must |
| F10 | ボイスメール送信 | Must |

### 2.2 Non-Functional Requirements

| # | Requirement |
|---|---|
| N1 | AWS/Amazon Connect 不要 |
| N2 | GitHub リポジトリに Push、誰でも再現可能 |
| N3 | セットアップが複雑でないこと（セットアップウィザードで実現） |
| N4 | デザインはモダンでクリーンな SaaS 風 |
| N5 | カラーは Salesforce / Agentforce パレット中心 |
| N6 | テキストで会話を擬似的に再現する方式（実 VoIP は不要） |
| N7 | プロジェクト名: VoxCanvas |

### 2.3 Out of Scope

- エージェントステータス切替 (F11)
- CTR Sync / マルチパーティ通話 (F12)
- 複数コール同時管理 (F13)
- コール履歴・統計ダッシュボード (F14)
- デモシナリオプリセット
- モバイル対応（デスクトップ前提）

---

## 3. Architecture

### 3.1 Approach

byo-demo-connector のコードを参考実装として学び、VoxCanvas を独立プロジェクトとして再構築する。サーバーロジックを移植・改良し、Voice 機能に特化してスリム化。1リポジトリで完結。

### 3.2 System Architecture (Unified Server)

```
[Browser]  ←── static files ──  [VoxCanvas Server (Express)]  ──→  [Salesforce Org]
                                        │                              │
                                  ┌─────┴──────┐                ┌─────┴──────┐
                                  │ Frontend    │                │ SCRT2 API  │
                                  │ (Vite dist) │                │ VoiceCall  │
                                  │ Dashboard   │                │ Conv.Entry │
                                  │ Setup Wiz.  │                │ Omni-Ch.   │
                                  ├─────────────┤                │ Service C. │
                                  │ API Routes  │                └────────────┘
                                  │ Auth Module │
                                  │ SCRT2 Client│
                                  └─────────────┘
```

Single Express server that:
1. Serves Vite-built static files (Dashboard UI + Setup Wizard)
2. Exposes REST API endpoints for voice operations
3. Communicates with Salesforce SCRT2 API via JWT-authenticated HTTPS

### 3.3 Development vs Production

| Mode | Frontend | Backend | Command |
|---|---|---|---|
| Development | Vite dev server (HMR, port 5173) with proxy to Express | Express API (port 3030) | `npm run dev` |
| Production | Vite build → `dist/` served by Express | Express API (port 3030) | `npm run build && npm start` |

### 3.4 Tech Stack

| Item | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Server | Express.js |
| Frontend Build | Vite |
| Frontend JS | Vanilla JavaScript (ES modules) |
| Styling | Tailwind CSS (build pipeline) |
| Fonts | Manrope (body) / JetBrains Mono (code/mono) |
| Auth | JWT Bearer Token (RSA 2048-bit) |
| HTTPS | Self-signed certificate (local dev) |

---

## 4. Project Structure

```
voxcanvas/
  ├── src/
  │   ├── server/
  │   │   ├── index.js           # Express entry point
  │   │   ├── routes/
  │   │   │   ├── voice-call.js  # POST, PATCH /api/voice-call
  │   │   │   ├── transcription.js # POST /api/voice-call/:id/transcription
  │   │   │   ├── voicemail.js   # POST /api/voicemail
  │   │   │   ├── tenant.js      # POST /api/tenant/configure
  │   │   │   ├── health.js      # GET /api/health
  │   │   │   └── setup.js       # GET/POST /api/setup/*
  │   │   ├── scrt2/
  │   │   │   ├── client.js      # SCRT2 API client
  │   │   │   └── types.js       # Request/response shapes
  │   │   ├── auth/
  │   │   │   ├── jwt.js         # JWT token generation
  │   │   │   └── oauth.js       # OAuth 2.0 flow
  │   │   └── setup/
  │   │       └── wizard.js      # Setup wizard backend logic
  │   └── client/
  │       ├── index.html         # Dashboard SPA entry
  │       ├── setup.html         # Setup wizard entry
  │       ├── js/
  │       │   ├── app.js         # Main app initialization
  │       │   ├── call-control.js  # Left panel logic
  │       │   ├── conversation.js  # Center dual-window logic
  │       │   ├── tools.js       # Right panel logic
  │       │   ├── api-client.js  # HTTP client for /api/*
  │       │   └── ui-utils.js    # Toast, log, shared UI helpers
  │       ├── css/
  │       │   └── app.css        # Tailwind directives + custom styles
  │       └── assets/
  ├── scripts/
  │   └── init.js                # npm run init (auto-setup)
  ├── certs/                     # Generated certificates (.gitignore)
  ├── .env                       # Credentials (.gitignore)
  ├── .env.example               # Template
  ├── .gitignore
  ├── vite.config.js
  ├── tailwind.config.js
  ├── package.json
  └── README.md
```

---

## 5. API Design

### 5.1 Voice API Endpoints

| Endpoint | Method | Purpose | byo-demo-connector equivalent |
|---|---|---|---|
| `/api/voice-call` | POST | Create voice call (inbound/outbound) | `/api/createVoiceCall` |
| `/api/voice-call/:vendorCallKey` | PATCH | Update call state, register recording URL | `/api/updateVoiceCall` |
| `/api/voice-call/:vendorCallKey/transcription` | POST | Send real-time transcription | `/api/createTranscription` |
| `/api/voicemail` | POST | Send voicemail | `/api/sendVoiceMail` |
| `/api/tenant/configure` | POST | Initialize tenant info | `/api/configureTenantInfo` |
| `/api/health` | GET | Server & SF connection status | (new) |

### 5.2 Setup Wizard API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/setup/status` | GET | Return current configuration state |
| `/api/setup/connect` | POST | Start OAuth authentication |
| `/api/setup/callback` | GET | Receive OAuth callback |
| `/api/setup/certificate` | POST | Generate or upload certificate |
| `/api/setup/complete` | POST | Finalize setup, save to .env |

### 5.3 Error Response Format

```json
{
  "error": true,
  "code": "AUTH_FAILED",
  "message": "JWT token expired. Please reconnect to Salesforce."
}
```

### 5.4 Data Flow: Call Creation → Transcription

```
[Browser] POST /api/voice-call { callType:"inbound", from:"090-...", to:"0120-..." }
    ↓
[Express] VoiceCallRouteHandler
    ↓ Generate vendorCallKey (UUID)
[SCRT2Client] → Salesforce SCRT2 API (createVoiceCall)
    ↓ VoiceCall record created → Omni-Channel routes to agent
[Express] ← { vendorCallKey, voiceCallId, status }
    ↓
[Browser] Stores vendorCallKey for subsequent API calls

[Browser] POST /api/voice-call/:vendorCallKey/transcription { speaker:"CUSTOMER", text:"..." }
    ↓
[SCRT2Client] → Salesforce SCRT2 API (sendRealtimeConversationEvents)
    ↓ ConversationEntry record created
[Service Console] Enhanced Conversation component displays in real-time
```

### 5.5 Authentication Flow (JWT Bearer Token)

```
[Setup Wizard] → Generate certificate (RSA 2048bit) → cert.pem / key.pem
    ↓ Upload cert.pem to Connected App in Salesforce
[Server startup] key.pem + Connected App credentials → Generate JWT
    ↓ POST /services/oauth2/token (grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer)
    ↓ Receive access_token → Store in memory
    ↓ SCRT2 API calls use Authorization: Bearer {access_token}
    ↓ Auto-refresh on expiration
```

---

## 6. UI Design

### 6.1 Layout: Dashboard (Single Screen)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Header] VoxCanvas v2.0          ● Connected  CCPF-New             │
├──────────┬──────────────────────────────────────┬───────────────────┤
│          │          CONVERSATION                │                   │
│  CALL    │  ┌──────────────┬──────────────┐     │    TOOLS          │
│  CONTROL │  │  CUSTOMER    │  AGENT       │     │                   │
│          │  │  (orange)    │  (blue)      │     │  ▪ Recording      │
│  Type    │  │              │              │     │  ▪ Voicemail      │
│  From    │  │  messages... │  messages... │     │  ▪ Activity Log   │
│  To      │  │              │              │     │                   │
│          │  │  [phrases]   │  [phrases]   │     │                   │
│ [Start]  │  │  [input ▶]  │  [input ▶]  │     │                   │
│ [End]    │  └──────────────┴──────────────┘     │                   │
├──────────┴──────────────────────────────────────┴───────────────────┤
│ Server: 127.0.0.1:3030                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Component Breakdown

| Component | Width | Description |
|---|---|---|
| **Header Bar** | Full width | Brand gradient, SF connection status (live pulse), org alias |
| **Call Control Panel** | 240px fixed | Inbound/Outbound toggle, phone inputs, Start/End Call, active call timer & VendorCallKey |
| **Conversation Panels** | Flex (remaining) | Dual-window: Customer (left, orange) / Agent (right, blue). Chat bubbles, quick phrases, independent inputs |
| **Tools Panel** | 200px fixed | Recording upload (drag & drop), voicemail sender, activity log drawer |

### 6.3 Conversation Panel Behavior

- Each panel has independent input and send button
- Sent message appears as right-aligned bubble in sender's panel
- Same message appears as left-aligned, semi-transparent bubble in opposite panel (with role label)
- Quick phrases are role-specific (Customer: inquiry phrases, Agent: response phrases)
- Keyboard shortcut: Cmd/Ctrl+Enter to send
- Timestamps on all messages

### 6.4 Color Palette

| Purpose | HEX |
|---|---|
| Agent Primary | `#0176D3` (Salesforce Blue) |
| Agent Dark | `#014486` (Salesforce Navy) |
| Customer Primary | `#FE9339` (Salesforce Orange) |
| Customer Dark | `#C86B1A` |
| Brand Gradient Start | `#032D60` (Salesforce Navy) |
| Brand Gradient End | `#00A1E0` (Salesforce Sky) |
| Success | `#2E844A` |
| Error | `#BA0517` |
| Background (main) | `#0d1117` |
| Background (panels) | `#111827` |

### 6.5 Typography

| Use | Font |
|---|---|
| Body text | Manrope |
| Monospace (code, keys) | JetBrains Mono |

---

## 7. Setup Wizard

### 7.1 Flow

5-step browser-based wizard that runs on first launch (when `.env` is unconfigured):

1. **Welcome & Prerequisites Check** — Auto-detect Node.js, OpenSSL, sf CLI (optional). Display environment status.
2. **Certificate Generation** — Auto-generate RSA 2048-bit self-signed certificate (recommended) or upload existing. Saves to `certs/`.
3. **Connected App Configuration** — Step-by-step guide for Salesforce Connected App setup. Provide cert.pem download, accept Consumer Key, Username, Login URL input.
4. **Test Connection** — JWT authentication test, SCRT2 endpoint reachability, Contact Center detection, VoiceCall object access verification.
5. **Setup Complete** — Save configuration to `.env`, redirect to Dashboard.

### 7.2 Behavior

- Server redirects to `/setup` when `.env` is missing or incomplete
- `/setup` is always accessible for reconfiguration
- Setup state is tracked server-side, allowing resume after browser refresh
- All credentials are stored in `.env` only (never sent to external services)

### 7.3 `npm run init` Script

CLI-based setup automation:
1. Check sf CLI availability
2. Generate certificates if not present
3. If sf CLI available: automate Connected App creation via Metadata API
4. If sf CLI not available: print manual instructions and launch Setup Wizard

---

## 8. Error Handling

### 8.1 Strategy by Layer

| Layer | Strategy |
|---|---|
| API Responses | Unified error format: `{ error, code, message }` |
| SCRT2 Communication Failure | UI toast notification + Activity Log detail. User-initiated retry |
| JWT Expiration | Auto-refresh. On failure, display reconnection banner in UI |
| Server Disconnection | Header pulse turns red, action buttons disabled |

### 8.2 Activity Log

- Drawer-style panel triggered from Tools Panel "Show Log" button
- Records all API request/response pairs chronologically
- Error entries highlighted in red for quick identification
- Useful for demo troubleshooting

---

## 9. HTTPS & Network

### 9.1 HTTPS Configuration

- Self-signed certificate for local HTTPS (Salesforce SCRT2 requires HTTPS)
- Same certificate used for both server HTTPS and JWT signing
- Browser warning on first access (documented in README)

### 9.2 Known Network Constraints

| Constraint | Mitigation |
|---|---|
| Must use `127.0.0.1` not `localhost` | Default config uses `127.0.0.1`, documented in README |
| CORS not needed (same-origin) | Unified server eliminates CORS issues |

---

## 10. Salesforce Prerequisites

These must be configured in the Salesforce org before using VoxCanvas:

1. **ConversationVendorInfo** — Create Partner Telephony vendor (e.g., `VoxCanvas_Partner_Telephony`)
2. **Contact Center** — Deploy via Metadata API (`sf project deploy start`). XML template included in project.
3. **Permission Sets** — Assign `ContactCenterAdminExternalTelephony` and `ContactCenterAgentExternalTelephony`
4. **Contact Center Users** — Add users to the Contact Center
5. **Presence Status** — Create Presence Status with Phone channel (e.g., "Available for Phone")
6. **Omni-Channel Utility** — Add to Service Console app
7. **Enhanced Conversation Component** — Add to Voice Call record page via Lightning App Builder (manual)
8. **Connected App** — Created during Setup Wizard (Step 3)

---

## 11. Reference: byo-demo-connector

### 11.1 Repository

- URL: https://github.com/salesforce-misc/byo-demo-connector
- Status: Active (2025 end, commits ongoing)
- License: Apache-2.0
- Role in VoxCanvas v2: Reference implementation only (code is studied, not imported)

### 11.2 Key Source Files to Study

| File | Purpose |
|---|---|
| Server entry point | Express setup, HTTPS configuration, route registration |
| SCRT2 API calls | JWT auth flow, createVoiceCall, sendTranscription payloads |
| `/api/configureTenantInfo` | Tenant initialization sequence |
| `.env` configuration | Required environment variables |
| Contact Center XML | XML structure for Partner Telephony |

### 11.3 Pitfalls from v1 (Do Not Repeat)

1. Do not use `sfdx` commands (deprecated since June 2024)
2. Metadata type name is `ConversationVendorInfo` (not `ConversationVendorInformation`)
3. Deploy Contact Center XML via Metadata API, not UI wizard
4. Use `127.0.0.1` not `localhost` to avoid CORS errors
5. Permission set names contain "Partner Telephony" not "BYOT"
6. Voice tab in `/ccaas` requires initialization via `/api/configureTenantInfo` (only fires through SF iframe)
7. Do not use deprecated repos: `salesforce/demo-scv-connector`, `salesforce-misc/byoc-ott-demo-app`

---

## 12. Demo Flow (Target)

```
[Setup — One-time]
1. git clone && npm install
2. npm start → Setup Wizard opens automatically
3. Follow 5-step wizard to connect to Salesforce org
4. Complete Salesforce-side prerequisites (permission sets, Contact Center, etc.)

[Demo Execution]
5. Open VoxCanvas Dashboard (https://127.0.0.1:3030)
6. Salesforce Service Console: Open Omni-Channel Utility → Status: Available for Phone
7. VoxCanvas: Select Inbound/Outbound, enter phone numbers → "Start Call"
8. Service Console: Call pop appears → Accept
9. VoxCanvas: Type in Customer panel (left) → message appears in SF
10. VoxCanvas: Type in Agent panel (right) → message appears in SF
11. (Optional) Upload recording, send voicemail from Tools panel
12. "End Call" to close
```
