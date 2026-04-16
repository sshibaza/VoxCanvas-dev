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

Open `http://127.0.0.1:5173` for the dashboard (dev mode) or `https://127.0.0.1:3030` after `npm run build && npm start` (production).

## Setup

### 1. Generate Certificates

```bash
npm run init
```

This creates HTTPS and JWT certificates in `certs/`.

### 2. Salesforce Configuration

**Connected App:**
1. Setup → App Manager → New Connected App
2. Enable OAuth Settings, select scopes: `api`, `refresh_token`
3. Upload `certs/jwt.pem` as the digital certificate
4. Copy Consumer Key to `.env` as `SF_CONSUMER_KEY`
5. Set `SF_USERNAME` in `.env`

**Contact Center:**
```bash
sf project deploy start \
  --source-dir force-app/main/default/callCenters/ \
  --target-org YOUR_ORG
```

**Permission Sets:**
```bash
sf org assign permset --name ContactCenterAdminExternalTelephony --target-org YOUR_ORG
sf org assign permset --name ContactCenterAgentExternalTelephony --target-org YOUR_ORG
```

**Service Console:**
1. Add Omni-Channel Utility to your Service Console app
2. Create Presence Status with Phone channel (e.g., "Available for Phone")
3. Add Enhanced Conversation component to Voice Call record page (Lightning App Builder)

### 3. Run

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

- Use `127.0.0.1` (not `localhost`) when adding the callback/CORS origin on the Salesforce side — the Connected App and SCRT2 CORS allowlist expect an explicit host
- Accept the self-signed certificate warning on first visit to the Node HTTPS server
- Permission set names use "Partner Telephony" not "BYOT"
- Contact Center XML must be deployed via Metadata API, not UI wizard
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
