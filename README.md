# VoxCanvas v2

Salesforce Service Cloud Voice (Partner Telephony) demo environment.
Simulate voice calls, real-time transcription, and voicemail without Amazon Connect.

## Quick Start

```bash
git clone <repo-url> && cd voxcanvas
npm install
npm run init      # Generate certificates
npm run dev       # Start development server
```

**First run?** Launch the Setup Wizard at `http://127.0.0.1:5173/setup.html` — or simply **double-click `setup.html` in the project root** to open a launcher page that takes you there. After the wizard finishes, the dashboard is at `http://127.0.0.1:5173/`. Production builds (`npm run build && npm start`) serve both routes over `https://127.0.0.1:3030`.

## Setup

### 1. Generate Certificates

```bash
npm run init
```

This creates HTTPS and JWT certificates in `certs/`.

### 2. Create Partner Telephony Contact Center

VoxCanvas does not ship Contact Center metadata — the SCRT endpoint and Contact Center API name are tenant-specific. Bring your own via either path:

- **Sample repo (recommended):** clone [salesforce-misc/byo-demo-connector](https://github.com/salesforce-misc/byo-demo-connector), edit the `ConversationVendorInfo` XML so `serviceEndpoint` points to your VoxCanvas URL (e.g. an ngrok tunnel to `https://127.0.0.1:3030`), then run `sf project deploy start --source-dir force-app/main/default --target-org YOUR_ORG`.
- **Setup UI:** `ConversationVendorInfo` has no Setup UI and must be deployed via Metadata API. Once deployed, create the Contact Center at Setup → Service Cloud Voice → Contact Centers → New, selecting your deployed vendor.

Note the Contact Center's API name — it becomes `CALL_CENTER_API_NAME` in `.env` (step 6).

### 3. Register JWT Public Key on Contact Center

1. Setup → Contact Centers → select the deployed VoxCanvas Contact Center
2. Edit → paste the contents of `certs/jwt.pem` into the **Public Key** field
3. Save

The Setup Wizard (step 3) shows this pem content with a Copy button.

### 4. Assign Permission Sets

```bash
sf org assign permset --name ContactCenterAdminExternalTelephony --target-org YOUR_ORG
sf org assign permset --name ContactCenterAgentExternalTelephony --target-org YOUR_ORG
```

### 5. Configure Service Console

1. Add Omni-Channel Utility to your Service Console app
2. Create Presence Status with Phone channel (e.g., "Available for Phone")
3. Add Enhanced Conversation component to Voice Call record page (Lightning App Builder)

### 6. Set Tenant Values

Either run the Setup Wizard (`npm run dev` → open `http://127.0.0.1:5173/setup.html`) or fill these manually in `.env`:

- `SF_SCRT_BASE_URL` — Setup → Service Cloud Voice → Partner Telephony
- `SF_ORG_ID` — Setup → Company Information
- `CALL_CENTER_API_NAME` — developer name of the deployed Contact Center
- `CALL_CENTER_PHONE` — the phone number used as "from"/"to" default (optional)

### 7. Run

```bash
npm run dev       # Development (hot reload)
npm run build && npm start  # Production
```

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
