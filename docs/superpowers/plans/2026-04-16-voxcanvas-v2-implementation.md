# VoxCanvas v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Salesforce Service Cloud Voice (Partner Telephony) demo environment with a dashboard UI, setup wizard, and SCRT2 API integration — no Amazon Connect required.

**Architecture:** Unified Express server serves both Vite-built static frontend and REST API endpoints. The server communicates with Salesforce SCRT2 API using JWT-authenticated HTTPS. Single process, single repo, `npm start` to launch.

**Tech Stack:** Node.js 18+, Express.js, Vite, Vanilla JS (ES modules), Tailwind CSS (build pipeline), JWT (jsonwebtoken + RSA 2048-bit), axios for SCRT2 HTTP calls.

**Reference repo:** byo-demo-connector is cloned at `/tmp/byo-demo-connector` for reference. Key files: `src/server/scrtConnector.mjs` (SCRT2 client), `src/server/server.mjs` (Express routes), `config.env` (env vars).

---

## File Structure

```
voxcanvas/
  ├── src/
  │   ├── server/
  │   │   ├── index.js              # Express entry, HTTPS, static file serving, route mounting
  │   │   ├── routes/
  │   │   │   ├── voice-call.js     # POST /api/voice-call, PATCH /api/voice-call/:vendorCallKey
  │   │   │   ├── transcription.js  # POST /api/voice-call/:vendorCallKey/transcription
  │   │   │   ├── voicemail.js      # POST /api/voicemail
  │   │   │   ├── tenant.js         # POST /api/tenant/configure
  │   │   │   ├── health.js         # GET /api/health
  │   │   │   └── setup.js          # GET/POST /api/setup/*
  │   │   ├── scrt2/
  │   │   │   └── client.js         # SCRT2 API client (JWT auth, createVoiceCall, transcription, etc.)
  │   │   └── auth/
  │   │       └── jwt.js            # JWT token generation and refresh
  │   └── client/
  │       ├── index.html            # Dashboard SPA entry
  │       ├── setup.html            # Setup wizard entry
  │       ├── js/
  │       │   ├── app.js            # Dashboard initialization, layout orchestration
  │       │   ├── call-control.js   # Left panel: call type, phone inputs, start/end call
  │       │   ├── conversation.js   # Center panel: dual-window chat, message rendering
  │       │   ├── tools.js          # Right panel: recording upload, voicemail, activity log
  │       │   ├── api-client.js     # HTTP client wrapper for /api/* calls
  │       │   ├── ui-utils.js       # Toast notifications, formatters, shared helpers
  │       │   └── setup-app.js      # Setup wizard multi-step logic
  │       └── css/
  │           └── app.css           # Tailwind directives + custom component styles
  ├── scripts/
  │   └── init.js                   # npm run init: cert generation, sf CLI detection
  ├── certs/                        # Generated certs (.gitignore'd)
  ├── .env                          # Runtime config (.gitignore'd)
  ├── .env.example                  # Template with all vars documented
  ├── .gitignore
  ├── vite.config.js                # Vite config: dev proxy, build output
  ├── tailwind.config.js            # Tailwind: custom colors, fonts
  ├── postcss.config.js             # PostCSS: Tailwind + autoprefixer
  ├── package.json
  └── README.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/sshiibazaki/CC-project/VoxCanvas
npm init -y
```

- [ ] **Step 2: Install production dependencies**

```bash
npm install express jsonwebtoken axios uuid dotenv
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D vite tailwindcss @tailwindcss/vite postcss autoprefixer concurrently nodemon
```

- [ ] **Step 4: Update package.json scripts**

Edit `package.json` to set these fields:

```json
{
  "name": "voxcanvas",
  "version": "2.0.0",
  "description": "Salesforce Service Cloud Voice (Partner Telephony) Demo Environment",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "nodemon --watch src/server src/server/index.js",
    "dev:client": "vite",
    "build": "vite build",
    "start": "node src/server/index.js",
    "init": "node scripts/init.js"
  }
}
```

- [ ] **Step 5: Create vite.config.js**

```js
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src/client',
  plugins: [tailwindcss()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:3030',
        secure: false,
      },
    },
  },
});
```

- [ ] **Step 6: Create tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/client/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        sf: {
          blue: '#0176D3',
          navy: '#014486',
          'navy-deep': '#032D60',
          sky: '#00A1E0',
          orange: '#FE9339',
          'orange-dark': '#C86B1A',
          success: '#2E844A',
          error: '#BA0517',
        },
        panel: {
          bg: '#111827',
          main: '#0d1117',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 7: Create postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 8: Create .env.example**

```env
# VoxCanvas Configuration
# Copy to .env and fill in values, or use the Setup Wizard (npm start)

# Server
SERVER_PORT=3030
SERVER_HOST=127.0.0.1

# Salesforce Connected App
SF_CONSUMER_KEY=
SF_USERNAME=
SF_LOGIN_URL=https://login.salesforce.com

# Paths (auto-generated by setup wizard)
SF_PRIVATE_KEY_PATH=certs/jwt.key
HTTPS_CERT_PATH=certs/server.pem
HTTPS_KEY_PATH=certs/server.key

# Contact Center
CALL_CENTER_API_NAME=
CALL_CENTER_PHONE=
```

- [ ] **Step 9: Update .gitignore**

Add `node_modules/` and `dist/` to the existing `.gitignore`:

```
node_modules/
dist/
certs/
.env
.superpowers/
```

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vite.config.js tailwind.config.js postcss.config.js .env.example .gitignore
git commit -m "feat: scaffold VoxCanvas v2 project with Vite + Tailwind + Express"
```

---

### Task 2: JWT Authentication Module

**Files:**
- Create: `src/server/auth/jwt.js`
- Test: manual verification via `node -e` in a later step

This module is the foundation — every SCRT2 call depends on it.

Reference: `/tmp/byo-demo-connector/src/server/scrtConnector.mjs` lines 42-51 (`getToken` function).

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/server/auth
```

- [ ] **Step 2: Write src/server/auth/jwt.js**

```js
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';

let cachedToken = null;
let tokenExpiresAt = 0;

const TOKEN_LIFETIME_SECONDS = 4 * 60 * 60; // 4 hours
const REFRESH_MARGIN_SECONDS = 5 * 60; // refresh 5 min before expiry

export function generateToken(orgId, callCenterApiName, privateKeyPath) {
  const privateKey = fs.readFileSync(path.resolve(privateKeyPath));
  const signOptions = {
    issuer: orgId,
    subject: callCenterApiName,
    expiresIn: `${TOKEN_LIFETIME_SECONDS}s`,
    algorithm: 'RS256',
  };
  const token = jwt.sign({}, privateKey, signOptions);
  cachedToken = token;
  tokenExpiresAt = Date.now() + (TOKEN_LIFETIME_SECONDS - REFRESH_MARGIN_SECONDS) * 1000;
  return token;
}

export function getToken(orgId, callCenterApiName, privateKeyPath) {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  return generateToken(orgId, callCenterApiName, privateKeyPath);
}

export function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
}
```

- [ ] **Step 3: Verify the module loads without errors**

```bash
node -e "import('./src/server/auth/jwt.js').then(m => console.log('OK: exports =', Object.keys(m)))"
```

Expected: `OK: exports = [ 'generateToken', 'getToken', 'clearTokenCache' ]`

- [ ] **Step 4: Commit**

```bash
git add src/server/auth/jwt.js
git commit -m "feat: add JWT authentication module for SCRT2 API"
```

---

### Task 3: SCRT2 API Client

**Files:**
- Create: `src/server/scrt2/client.js`

Reference: `/tmp/byo-demo-connector/src/server/scrtConnector.mjs` — the entire file. We re-implement its core functions with cleaner structure.

- [ ] **Step 1: Create directory**

```bash
mkdir -p src/server/scrt2
```

- [ ] **Step 2: Write src/server/scrt2/client.js**

```js
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getToken } from '../auth/jwt.js';

const TELEPHONY_API_PATH = '/telephony/v1';
const PROVIDER_NAME = 'voxcanvas';

export class Scrt2Client {
  constructor(config) {
    this.scrtBaseUrl = config.scrtBaseUrl || '';
    this.orgId = config.orgId || '';
    this.callCenterApiName = config.callCenterApiName || '';
    this.privateKeyPath = config.privateKeyPath || '';
    this.callCenterPhone = config.callCenterPhone || '';
  }

  configure({ scrtBaseUrl, orgId, callCenterApiName }) {
    this.scrtBaseUrl = scrtBaseUrl;
    this.orgId = orgId;
    this.callCenterApiName = callCenterApiName;
  }

  isConfigured() {
    return !!(this.scrtBaseUrl && this.orgId && this.callCenterApiName);
  }

  _getHeaders() {
    const token = getToken(this.orgId, this.callCenterApiName, this.privateKeyPath);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Telephony-Provider-Name': PROVIDER_NAME,
    };
  }

  _getClient() {
    return axios.create({
      baseURL: `${this.scrtBaseUrl}${TELEPHONY_API_PATH}`,
    });
  }

  async createVoiceCall({ callType, from, to }) {
    const vendorCallKey = uuidv4();
    const fieldValues = {
      callCenterApiName: this.callCenterApiName,
      initiationMethod: callType === 'inbound' ? 'Inbound' : 'Outbound',
      vendorCallKey,
      to: to || this.callCenterPhone,
      from,
      startTime: new Date().toISOString(),
      participants: [
        {
          participantKey: from,
          type: 'END_USER',
        },
      ],
    };

    const response = await this._getClient().post('/voiceCalls', fieldValues, {
      headers: this._getHeaders(),
    });

    return {
      vendorCallKey,
      voiceCallId: response.data.voiceCallId,
    };
  }

  async updateVoiceCall(voiceCallId, updates) {
    const fieldValues = {};
    if (updates.recordingUrl) fieldValues.recordingLocation = updates.recordingUrl;
    if (updates.endTime) fieldValues.endTime = updates.endTime;
    if (updates.isActiveCall !== undefined) fieldValues.isActiveCall = updates.isActiveCall;
    if (updates.startTime) fieldValues.startTime = updates.startTime;
    if (updates.callOrigin) fieldValues.callOrigin = updates.callOrigin;
    if (updates.totalRecordingDuration) fieldValues.totalRecordingDuration = updates.totalRecordingDuration;
    if (updates.agentInteractionDuration) {
      fieldValues.agentInteractionDuration = updates.agentInteractionDuration;
      fieldValues.totalHoldDuration = updates.totalHoldDuration;
    }

    const response = await this._getClient().patch(
      `/voiceCalls/${voiceCallId}`,
      fieldValues,
      { headers: this._getHeaders() }
    );
    return response.data;
  }

  async createTranscription(vendorCallKey, { content, senderType, messageId, participantId }) {
    const fieldValues = {
      messageId: messageId || uuidv4(),
      content,
      senderType,
      startTime: Date.now(),
      endTime: Date.now() + 25000,
      participantId: participantId || `${vendorCallKey}${senderType}`,
    };

    const response = await this._getClient().post(
      `/voiceCalls/${vendorCallKey}/messages`,
      fieldValues,
      { headers: this._getHeaders() }
    );
    return response.data;
  }

  async sendRealtimeConversationEvents(vendorCallKey, { service, persist, events }) {
    const timestampedEvents = events.map((event) => ({
      ...event,
      startTime: event.startTime || Date.now(),
    }));

    const fieldValues = {
      service,
      persist,
      events: timestampedEvents,
    };

    const response = await this._getClient().post(
      `/voiceCalls/${vendorCallKey}/realtimeConversationEvents`,
      fieldValues,
      { headers: this._getHeaders() }
    );
    return response.data;
  }

  async executeOmniFlow(voiceCallId, { dialedNumber, flowName, fallbackQueue }) {
    const fieldValues = {};
    if (dialedNumber) fieldValues.dialedNumber = dialedNumber;
    if (flowName) fieldValues.flowName = flowName;
    if (fallbackQueue) fieldValues.fallbackQueue = fallbackQueue;

    const response = await this._getClient().patch(
      `/voiceCalls/${voiceCallId}/omniFlow`,
      fieldValues,
      { headers: this._getHeaders() }
    );
    return response.data;
  }

  async sendVoiceMail({ from, to, transcripts, recordingUrl, recordingLength }) {
    // Step 1: Create inbound voice call
    const { vendorCallKey, voiceCallId } = await this.createVoiceCall({
      callType: 'inbound',
      from,
      to,
    });

    // Step 2: Mark as voicemail and active
    await this.updateVoiceCall(voiceCallId, {
      isActiveCall: true,
      callOrigin: 'Voicemail',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 61000).toISOString(),
    });

    // Step 3: Add transcription
    await this.createTranscription(vendorCallKey, {
      content: transcripts,
      senderType: 'END_USER',
    });

    // Step 4: Route through Omni
    await this.executeOmniFlow(voiceCallId, { dialedNumber: to });

    // Step 5: Finalize with recording
    await this.updateVoiceCall(voiceCallId, {
      recordingUrl,
      totalRecordingDuration: parseInt(recordingLength) || 0,
    });

    return { vendorCallKey, voiceCallId };
  }
}
```

- [ ] **Step 3: Verify the module loads**

```bash
node -e "import('./src/server/scrt2/client.js').then(m => console.log('OK: Scrt2Client =', typeof m.Scrt2Client))"
```

Expected: `OK: Scrt2Client = function`

- [ ] **Step 4: Commit**

```bash
git add src/server/scrt2/client.js
git commit -m "feat: add SCRT2 API client with voice call, transcription, voicemail support"
```

---

### Task 4: Express Server & API Routes

**Files:**
- Create: `src/server/index.js`
- Create: `src/server/routes/voice-call.js`
- Create: `src/server/routes/transcription.js`
- Create: `src/server/routes/voicemail.js`
- Create: `src/server/routes/tenant.js`
- Create: `src/server/routes/health.js`

- [ ] **Step 1: Create directories**

```bash
mkdir -p src/server/routes
```

- [ ] **Step 2: Write src/server/routes/health.js**

```js
import { Router } from 'express';

export function createHealthRouter(scrt2Client) {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      configured: scrt2Client.isConfigured(),
      scrtBaseUrl: scrt2Client.scrtBaseUrl ? '***configured***' : null,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
```

- [ ] **Step 3: Write src/server/routes/tenant.js**

```js
import { Router } from 'express';

export function createTenantRouter(scrt2Client) {
  const router = Router();

  router.post('/tenant/configure', (req, res) => {
    try {
      const { scrtBaseUrl, orgId, callCenterApiName } = req.body;
      if (!scrtBaseUrl || !orgId || !callCenterApiName) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'scrtBaseUrl, orgId, and callCenterApiName are required.',
        });
      }
      scrt2Client.configure({ scrtBaseUrl, orgId, callCenterApiName });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'CONFIGURE_FAILED',
        message: err.message,
      });
    }
  });

  return router;
}
```

- [ ] **Step 4: Write src/server/routes/voice-call.js**

```js
import { Router } from 'express';

export function createVoiceCallRouter(scrt2Client) {
  const router = Router();

  // Create a new voice call
  router.post('/voice-call', async (req, res) => {
    try {
      const { callType, from, to } = req.body;
      if (!callType || !from) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'callType and from are required.',
        });
      }
      const result = await scrt2Client.createVoiceCall({ callType, from, to });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'CREATE_VOICE_CALL_FAILED',
        message: err.message,
      });
    }
  });

  // Update an existing voice call (voiceCallId passed in body, vendorCallKey in URL for routing)
  router.patch('/voice-call/:vendorCallKey', async (req, res) => {
    try {
      const { voiceCallId, ...updates } = req.body;
      if (!voiceCallId) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'voiceCallId is required in the request body.',
        });
      }
      const result = await scrt2Client.updateVoiceCall(voiceCallId, updates);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'UPDATE_VOICE_CALL_FAILED',
        message: err.message,
      });
    }
  });

  return router;
}
```

- [ ] **Step 5: Write src/server/routes/transcription.js**

```js
import { Router } from 'express';

export function createTranscriptionRouter(scrt2Client) {
  const router = Router();

  router.post('/voice-call/:vendorCallKey/transcription', async (req, res) => {
    try {
      const { vendorCallKey } = req.params;
      const { content, senderType } = req.body;
      if (!content || !senderType) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'content and senderType are required.',
        });
      }
      const result = await scrt2Client.createTranscription(vendorCallKey, {
        content,
        senderType,
        messageId: req.body.messageId,
        participantId: req.body.participantId,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'TRANSCRIPTION_FAILED',
        message: err.message,
      });
    }
  });

  return router;
}
```

- [ ] **Step 6: Write src/server/routes/voicemail.js**

```js
import { Router } from 'express';

export function createVoicemailRouter(scrt2Client) {
  const router = Router();

  router.post('/voicemail', async (req, res) => {
    try {
      const { from, to, transcripts, recordingUrl, recordingLength } = req.body;
      if (!from || !to || !transcripts) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'from, to, and transcripts are required.',
        });
      }
      const result = await scrt2Client.sendVoiceMail({
        from,
        to,
        transcripts,
        recordingUrl,
        recordingLength,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'VOICEMAIL_FAILED',
        message: err.message,
      });
    }
  });

  return router;
}
```

- [ ] **Step 7: Write src/server/index.js**

```js
import express from 'express';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Scrt2Client } from './scrt2/client.js';
import { createHealthRouter } from './routes/health.js';
import { createTenantRouter } from './routes/tenant.js';
import { createVoiceCallRouter } from './routes/voice-call.js';
import { createTranscriptionRouter } from './routes/transcription.js';
import { createVoicemailRouter } from './routes/voicemail.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// SCRT2 client instance
const scrt2Client = new Scrt2Client({
  scrtBaseUrl: process.env.SF_SCRT_BASE_URL || '',
  orgId: process.env.SF_ORG_ID || '',
  callCenterApiName: process.env.CALL_CENTER_API_NAME || '',
  privateKeyPath: process.env.SF_PRIVATE_KEY_PATH || 'certs/jwt.key',
  callCenterPhone: process.env.CALL_CENTER_PHONE || '',
});

// API routes
app.use('/api', createHealthRouter(scrt2Client));
app.use('/api', createTenantRouter(scrt2Client));
app.use('/api', createVoiceCallRouter(scrt2Client));
app.use('/api', createTranscriptionRouter(scrt2Client));
app.use('/api', createVoicemailRouter(scrt2Client));

// Serve static files in production
const distPath = path.resolve(__dirname, '../../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Start server
const port = parseInt(process.env.SERVER_PORT) || 3030;
const host = process.env.SERVER_HOST || '127.0.0.1';

const certPath = process.env.HTTPS_CERT_PATH || 'certs/server.pem';
const keyPath = process.env.HTTPS_KEY_PATH || 'certs/server.key';

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
  https.createServer(httpsOptions, app).listen(port, host, () => {
    console.log(`\nVoxCanvas server running at https://${host}:${port}`);
    console.log(`Dashboard: https://${host}:${port}/`);
  });
} else {
  app.listen(port, host, () => {
    console.log(`\nVoxCanvas server running at http://${host}:${port} (no HTTPS certs found)`);
    console.log(`Run 'npm run init' to generate certificates.`);
  });
}
```

- [ ] **Step 8: Verify server starts without errors (no certs, HTTP mode)**

```bash
SERVER_PORT=3030 node src/server/index.js &
sleep 1
curl http://127.0.0.1:3030/api/health
kill %1
```

Expected: `{"status":"ok","configured":false,...}`

- [ ] **Step 9: Commit**

```bash
git add src/server/
git commit -m "feat: add Express server with voice-call, transcription, voicemail, health API routes"
```

---

### Task 5: Setup Script (npm run init)

**Files:**
- Create: `scripts/init.js`

This script generates HTTPS and JWT certificates and checks for sf CLI.

- [ ] **Step 1: Create directory**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Write scripts/init.js**

```js
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CERTS_DIR = 'certs';

function log(msg) {
  console.log(`[VoxCanvas Init] ${msg}`);
}

function ensureCertsDir() {
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
    log(`Created ${CERTS_DIR}/ directory`);
  }
}

function generateServerCert() {
  const certFile = path.join(CERTS_DIR, 'server.pem');
  const keyFile = path.join(CERTS_DIR, 'server.key');

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    log('HTTPS server certificate already exists, skipping.');
    return;
  }

  log('Generating self-signed HTTPS server certificate...');
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout ${keyFile} -out ${certFile} ` +
      `-days 365 -nodes -subj "/CN=VoxCanvas Local Dev"`,
    { stdio: 'inherit' }
  );
  log(`Created ${certFile} and ${keyFile}`);
}

function generateJwtKeyPair() {
  const keyFile = path.join(CERTS_DIR, 'jwt.key');
  const certFile = path.join(CERTS_DIR, 'jwt.pem');

  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    log('JWT key pair already exists, skipping.');
    return;
  }

  log('Generating RSA 2048-bit key pair for JWT signing...');
  execSync(`openssl genrsa -out ${keyFile} 2048`, { stdio: 'inherit' });
  execSync(
    `openssl req -new -x509 -key ${keyFile} -out ${certFile} ` +
      `-days 365 -subj "/CN=VoxCanvas JWT"`,
    { stdio: 'inherit' }
  );
  log(`Created ${keyFile} (private) and ${certFile} (upload to Salesforce Connected App)`);
}

function checkSfCli() {
  try {
    const version = execSync('sf version', { encoding: 'utf-8' }).trim();
    log(`Salesforce CLI detected: ${version}`);
    return true;
  } catch {
    log('Salesforce CLI not found (optional — you can configure manually via Setup Wizard).');
    return false;
  }
}

function createEnvIfMissing() {
  if (fs.existsSync('.env')) {
    log('.env file already exists, skipping.');
    return;
  }
  if (fs.existsSync('.env.example')) {
    fs.copyFileSync('.env.example', '.env');
    log('Created .env from .env.example — fill in your Salesforce credentials.');
  }
}

function main() {
  console.log('\n========================================');
  console.log('  VoxCanvas v2 — Initial Setup');
  console.log('========================================\n');

  ensureCertsDir();
  generateServerCert();
  generateJwtKeyPair();
  checkSfCli();
  createEnvIfMissing();

  console.log('\n========================================');
  console.log('  Setup complete!');
  console.log('========================================');
  console.log('\nNext steps:');
  console.log('  1. Upload certs/jwt.pem to your Salesforce Connected App');
  console.log('  2. Edit .env with your Salesforce credentials');
  console.log('  3. Run: npm run dev');
  console.log('  4. Open: https://127.0.0.1:3030');
  console.log('');
}

main();
```

- [ ] **Step 3: Test the init script**

```bash
npm run init
```

Expected: Certificates generated in `certs/`, `.env` created from template, messages about next steps.

- [ ] **Step 4: Verify certificate files exist**

```bash
ls -la certs/
```

Expected: `server.pem`, `server.key`, `jwt.key`, `jwt.pem`

- [ ] **Step 5: Commit**

```bash
git add scripts/init.js
git commit -m "feat: add init script for certificate generation and environment setup"
```

---

### Task 6: Frontend — Base HTML & CSS

**Files:**
- Create: `src/client/index.html`
- Create: `src/client/css/app.css`
- Create: `src/client/js/app.js`

- [ ] **Step 1: Create directories**

```bash
mkdir -p src/client/js src/client/css
```

- [ ] **Step 2: Write src/client/css/app.css**

```css
@import "tailwindcss";

/* Custom scrollbar for dark theme */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* Pulse animation for connection status */
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.status-pulse {
  animation: pulse-dot 2s ease-in-out infinite;
}

/* Message bubble animations */
@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.message-bubble {
  animation: slide-in 0.2s ease-out;
}

/* Toast notification */
@keyframes toast-in {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes toast-out {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}
.toast-enter { animation: toast-in 0.3s ease-out; }
.toast-exit { animation: toast-out 0.3s ease-in; }
```

- [ ] **Step 3: Write src/client/index.html**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VoxCanvas — Partner Telephony Demo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body class="bg-panel-main text-white font-sans min-h-screen flex flex-col">

  <!-- Header -->
  <header id="header" class="bg-gradient-to-r from-sf-navy-deep via-sf-blue to-sf-sky px-5 py-3 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-3">
      <h1 class="text-lg font-extrabold tracking-tight">VoxCanvas</h1>
      <span class="text-xs opacity-50 bg-white/10 px-2 py-0.5 rounded-full">v2.0</span>
    </div>
    <div class="flex items-center gap-4">
      <div id="connection-status" class="flex items-center gap-2">
        <span id="status-dot" class="w-2 h-2 rounded-full bg-sf-error"></span>
        <span id="status-text" class="text-xs opacity-70">Disconnected</span>
      </div>
      <span id="org-alias" class="text-xs opacity-50"></span>
    </div>
  </header>

  <!-- Main 3-column layout -->
  <main class="flex flex-1 overflow-hidden">

    <!-- Left Panel: Call Control -->
    <aside id="call-control-panel" class="w-60 bg-panel-bg border-r border-white/[0.08] flex flex-col shrink-0">
    </aside>

    <!-- Center: Conversation -->
    <section id="conversation-panel" class="flex-1 flex flex-col min-w-0">
    </section>

    <!-- Right Panel: Tools -->
    <aside id="tools-panel" class="w-52 bg-panel-bg border-l border-white/[0.08] flex flex-col shrink-0">
    </aside>

  </main>

  <!-- Toast Container -->
  <div id="toast-container" class="fixed top-4 right-4 flex flex-col gap-2 z-50"></div>

  <script type="module" src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write src/client/js/app.js (minimal bootstrap)**

```js
import { initCallControl } from './call-control.js';
import { initConversation } from './conversation.js';
import { initTools } from './tools.js';
import { ApiClient } from './api-client.js';

const api = new ApiClient();

async function checkHealth() {
  try {
    const health = await api.get('/api/health');
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (health.configured) {
      dot.className = 'w-2 h-2 rounded-full bg-sf-success status-pulse';
      text.textContent = 'Connected';
    } else {
      dot.className = 'w-2 h-2 rounded-full bg-sf-orange status-pulse';
      text.textContent = 'Not Configured';
    }
  } catch {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.className = 'w-2 h-2 rounded-full bg-sf-error';
    text.textContent = 'Server Offline';
  }
}

async function init() {
  await checkHealth();
  initCallControl(api);
  initConversation(api);
  initTools(api);

  // Poll health every 30 seconds
  setInterval(checkHealth, 30000);
}

init();
```

- [ ] **Step 5: Commit**

```bash
git add src/client/
git commit -m "feat: add base dashboard HTML shell with header, 3-column layout, and CSS"
```

---

### Task 7: Frontend — API Client Module

**Files:**
- Create: `src/client/js/api-client.js`
- Create: `src/client/js/ui-utils.js`

- [ ] **Step 1: Write src/client/js/api-client.js**

```js
export class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async _request(method, path, body) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, options);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.message || `API error: ${data.code}`);
    }
    return data;
  }

  get(path) {
    return this._request('GET', path);
  }

  post(path, body) {
    return this._request('POST', path, body);
  }

  patch(path, body) {
    return this._request('PATCH', path, body);
  }
}
```

- [ ] **Step 2: Write src/client/js/ui-utils.js**

```js
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');

  const bgColors = {
    info: 'bg-sf-blue',
    success: 'bg-sf-success',
    error: 'bg-sf-error',
    warning: 'bg-sf-orange',
  };

  toast.className = `${bgColors[type] || bgColors.info} text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium toast-enter max-w-sm`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/js/api-client.js src/client/js/ui-utils.js
git commit -m "feat: add API client wrapper and UI utility functions"
```

---

### Task 8: Frontend — Call Control Panel

**Files:**
- Create: `src/client/js/call-control.js`

- [ ] **Step 1: Write src/client/js/call-control.js**

```js
import { showToast, formatDuration } from './ui-utils.js';

let activeCall = null;
let timerInterval = null;
let callStartTime = null;

export function initCallControl(api) {
  const panel = document.getElementById('call-control-panel');
  panel.innerHTML = `
    <!-- Call Setup -->
    <div class="p-4 border-b border-white/[0.06]">
      <div class="text-[0.6rem] font-bold tracking-widest opacity-40 mb-3">CALL CONTROL</div>

      <!-- Call Type Toggle -->
      <div class="mb-3">
        <div class="text-xs opacity-50 mb-1">Call Type</div>
        <div class="flex bg-white/5 rounded-md p-0.5" id="call-type-toggle">
          <button data-type="inbound" class="flex-1 py-1.5 text-xs font-semibold rounded text-center transition-colors bg-sf-blue/30">Inbound</button>
          <button data-type="outbound" class="flex-1 py-1.5 text-xs font-semibold rounded text-center transition-colors opacity-50">Outbound</button>
        </div>
      </div>

      <!-- Phone Inputs -->
      <div class="mb-2">
        <label class="text-xs opacity-50 mb-1 block">From (Customer)</label>
        <input id="call-from" type="text" value="090-1234-5678"
          class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-sf-blue focus:outline-none" />
      </div>
      <div class="mb-3">
        <label class="text-xs opacity-50 mb-1 block">To (Contact Center)</label>
        <input id="call-to" type="text" value="0120-000-000"
          class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-sf-blue focus:outline-none" />
      </div>

      <!-- Start Call Button -->
      <button id="btn-start-call"
        class="w-full bg-gradient-to-r from-sf-orange to-sf-orange-dark py-2.5 rounded-lg text-sm font-bold tracking-wide hover:brightness-110 transition-all">
        Start Call
      </button>
    </div>

    <!-- Active Call Info (hidden initially) -->
    <div id="active-call-section" class="p-4 border-b border-white/[0.06] flex-1 hidden">
      <div class="text-[0.6rem] font-bold tracking-widest opacity-40 mb-3">ACTIVE CALL</div>
      <div class="bg-sf-success/10 border border-sf-success/30 rounded-lg p-3">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs text-sf-success font-semibold">In Progress</span>
          <span id="call-timer" class="text-sm font-bold font-mono">00:00</span>
        </div>
        <div class="text-[0.5rem] opacity-40 mt-1">VendorCallKey:</div>
        <div id="vendor-call-key" class="text-[0.5rem] font-mono opacity-60 break-all"></div>
      </div>

      <button id="btn-end-call"
        class="w-full mt-3 bg-sf-error/30 border border-sf-error/50 py-2 rounded-md text-xs font-semibold hover:bg-sf-error/50 transition-colors">
        End Call
      </button>
    </div>

    <!-- Footer -->
    <div class="mt-auto p-3 border-t border-white/[0.06] text-[0.5rem] opacity-30">
      Server: 127.0.0.1:3030
    </div>
  `;

  // Call type toggle
  let selectedType = 'inbound';
  const toggleBtns = panel.querySelectorAll('#call-type-toggle button');
  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      toggleBtns.forEach((b) => {
        b.className = b.dataset.type === selectedType
          ? 'flex-1 py-1.5 text-xs font-semibold rounded text-center transition-colors bg-sf-blue/30'
          : 'flex-1 py-1.5 text-xs font-semibold rounded text-center transition-colors opacity-50';
      });
    });
  });

  // Start Call
  document.getElementById('btn-start-call').addEventListener('click', async () => {
    const from = document.getElementById('call-from').value.trim();
    const to = document.getElementById('call-to').value.trim();
    if (!from) {
      showToast('Enter a "From" phone number', 'warning');
      return;
    }
    try {
      const result = await api.post('/api/voice-call', {
        callType: selectedType,
        from,
        to,
      });
      activeCall = result;
      onCallStarted(result);
      showToast('Call started successfully', 'success');
    } catch (err) {
      showToast(`Failed to start call: ${err.message}`, 'error');
    }
  });

  // End Call
  document.getElementById('btn-end-call').addEventListener('click', async () => {
    if (!activeCall) return;
    try {
      await api.patch(`/api/voice-call/${activeCall.vendorCallKey}`, {
        voiceCallId: activeCall.voiceCallId,
        isActiveCall: false,
        endTime: new Date().toISOString(),
      });
      onCallEnded();
      showToast('Call ended', 'info');
    } catch (err) {
      showToast(`Failed to end call: ${err.message}`, 'error');
    }
  });
}

function onCallStarted(callData) {
  activeCall = callData;
  document.getElementById('active-call-section').classList.remove('hidden');
  document.getElementById('vendor-call-key').textContent = callData.vendorCallKey;

  callStartTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    document.getElementById('call-timer').textContent = formatDuration(elapsed);
  }, 1000);

  // Dispatch custom event for conversation panel
  window.dispatchEvent(new CustomEvent('voxcanvas:call-started', { detail: callData }));
}

function onCallEnded() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  activeCall = null;
  document.getElementById('active-call-section').classList.add('hidden');

  window.dispatchEvent(new CustomEvent('voxcanvas:call-ended'));
}

export function getActiveCall() {
  return activeCall;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/js/call-control.js
git commit -m "feat: add call control panel with start/end call, timer, type toggle"
```

---

### Task 9: Frontend — Conversation Panel (Dual-Window)

**Files:**
- Create: `src/client/js/conversation.js`

- [ ] **Step 1: Write src/client/js/conversation.js**

```js
import { showToast, formatTime } from './ui-utils.js';

let messages = [];
let currentCall = null;

export function initConversation(api) {
  const panel = document.getElementById('conversation-panel');

  panel.innerHTML = `
    <!-- Conversation Header -->
    <div class="px-4 py-2 border-b border-white/[0.06] flex justify-center gap-8 bg-white/[0.02] shrink-0">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-sf-orange"></span>
        <span class="text-xs font-semibold text-sf-orange">Customer</span>
        <span id="conv-customer-phone" class="text-[0.5rem] opacity-40"></span>
      </div>
      <div class="w-px bg-white/10"></div>
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-sf-blue"></span>
        <span class="text-xs font-semibold text-sf-blue">Agent</span>
        <span class="text-[0.5rem] opacity-40">Operator</span>
      </div>
    </div>

    <!-- Split Panels -->
    <div class="flex flex-1 overflow-hidden">
      ${createChatPanel('customer', 'sf-orange', 'Type as customer...')}
      <div class="w-px bg-white/[0.06]"></div>
      ${createChatPanel('agent', 'sf-blue', 'Type as agent...')}
    </div>
  `;

  // Listen for call events
  window.addEventListener('voxcanvas:call-started', (e) => {
    currentCall = e.detail;
    messages = [];
    clearMessages();
    document.getElementById('conv-customer-phone').textContent = document.getElementById('call-from').value;
    enableInputs(true);
  });

  window.addEventListener('voxcanvas:call-ended', () => {
    currentCall = null;
    enableInputs(false);
  });

  // Setup send handlers for both panels
  setupSendHandler('customer', 'END_USER', api);
  setupSendHandler('agent', 'HUMAN_AGENT', api);

  // Initially disabled
  enableInputs(false);
}

function createChatPanel(role, color, placeholder) {
  const quickPhrases = role === 'customer'
    ? ['Account inquiry', 'I need help with...', 'Thank you']
    : ['How can I help?', 'Let me check...', 'One moment please'];

  return `
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Messages -->
      <div id="${role}-messages" class="flex-1 p-4 overflow-y-auto">
        <div class="flex flex-col gap-2"></div>
      </div>

      <!-- Quick Phrases -->
      <div class="px-3 py-1.5 border-t border-white/[0.04] flex gap-1.5 flex-wrap shrink-0">
        ${quickPhrases
          .map(
            (p) =>
              `<button class="quick-phrase bg-${color}/10 border border-${color}/20 rounded-full px-2.5 py-0.5 text-[0.5rem] hover:bg-${color}/20 transition-colors" data-role="${role}">${p}</button>`
          )
          .join('')}
      </div>

      <!-- Input -->
      <div class="px-3 py-2.5 border-t border-white/[0.06] flex gap-2 items-center shrink-0">
        <input id="${role}-input" type="text" placeholder="${placeholder}" disabled
          class="flex-1 bg-white/5 border border-${color}/20 rounded-lg px-3 py-2 text-xs focus:border-${color} focus:outline-none disabled:opacity-30" />
        <button id="${role}-send" disabled
          class="bg-${color} w-7 h-7 rounded-md flex items-center justify-center text-sm hover:brightness-110 transition-all disabled:opacity-30">
          &#9654;
        </button>
      </div>
    </div>
  `;
}

function setupSendHandler(role, senderType, api) {
  const sendMessage = async () => {
    const input = document.getElementById(`${role}-input`);
    const text = input.value.trim();
    if (!text || !currentCall) return;

    input.value = '';

    // Add to local UI immediately
    const msg = { role, text, timestamp: Date.now() };
    messages.push(msg);
    renderMessage(msg);

    // Send to Salesforce
    try {
      await api.post(`/api/voice-call/${currentCall.vendorCallKey}/transcription`, {
        content: text,
        senderType,
      });
    } catch (err) {
      showToast(`Transcription failed: ${err.message}`, 'error');
    }
  };

  // Wait for DOM to render before attaching events
  setTimeout(() => {
    const input = document.getElementById(`${role}-input`);
    const sendBtn = document.getElementById(`${role}-send`);

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        sendMessage();
      }
    });

    // Quick phrases
    document.querySelectorAll(`.quick-phrase[data-role="${role}"]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        input.value = btn.textContent;
        input.focus();
      });
    });
  }, 0);
}

function renderMessage(msg) {
  const ownPanel = document.querySelector(`#${msg.role}-messages .flex`);
  const otherRole = msg.role === 'customer' ? 'agent' : 'customer';
  const otherPanel = document.querySelector(`#${otherRole}-messages .flex`);
  const color = msg.role === 'customer' ? 'sf-orange' : 'sf-blue';
  const otherColor = msg.role === 'customer' ? 'sf-blue' : 'sf-orange';
  const roleLabel = msg.role === 'customer' ? 'Customer' : 'Agent';
  const time = formatTime(msg.timestamp);

  // Own panel: right-aligned
  const ownBubble = document.createElement('div');
  ownBubble.className = `message-bubble self-end bg-${color}/15 border border-${color}/20 rounded-xl rounded-br-sm px-3 py-2 max-w-[80%] text-xs`;
  ownBubble.innerHTML = `${escapeHtml(msg.text)}<div class="text-[0.45rem] opacity-40 text-right mt-1">${time}</div>`;
  ownPanel.appendChild(ownBubble);

  // Other panel: left-aligned, dimmed
  const otherBubble = document.createElement('div');
  otherBubble.className = `message-bubble self-start bg-${color}/10 border border-${color}/15 rounded-xl rounded-bl-sm px-3 py-2 max-w-[80%] text-xs opacity-50`;
  otherBubble.innerHTML = `<span class="text-[0.5rem] text-${color} font-medium">${roleLabel}:</span> ${escapeHtml(msg.text)}<div class="text-[0.45rem] opacity-40 mt-1">${time}</div>`;
  otherPanel.appendChild(otherBubble);

  // Auto-scroll both panels
  ownPanel.parentElement.scrollTop = ownPanel.parentElement.scrollHeight;
  otherPanel.parentElement.scrollTop = otherPanel.parentElement.scrollHeight;
}

function clearMessages() {
  ['customer', 'agent'].forEach((role) => {
    const container = document.querySelector(`#${role}-messages .flex`);
    if (container) container.innerHTML = '';
  });
}

function enableInputs(enabled) {
  ['customer', 'agent'].forEach((role) => {
    const input = document.getElementById(`${role}-input`);
    const send = document.getElementById(`${role}-send`);
    if (input) input.disabled = !enabled;
    if (send) send.disabled = !enabled;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/js/conversation.js
git commit -m "feat: add dual-window conversation panel with real-time messaging"
```

---

### Task 10: Frontend — Tools Panel

**Files:**
- Create: `src/client/js/tools.js`

- [ ] **Step 1: Write src/client/js/tools.js**

```js
import { showToast } from './ui-utils.js';
import { getActiveCall } from './call-control.js';

let logEntries = [];

export function initTools(api) {
  const panel = document.getElementById('tools-panel');
  panel.innerHTML = `
    <div class="p-4 flex-1 overflow-y-auto">
      <div class="text-[0.6rem] font-bold tracking-widest opacity-40 mb-3">TOOLS</div>

      <!-- Recording Upload -->
      <div class="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 mb-3">
        <div class="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <span>&#127908;</span> Call Recording
        </div>
        <div id="drop-zone"
          class="border border-dashed border-white/15 rounded-md py-4 px-2 text-center mb-2 transition-colors hover:border-sf-blue/40 cursor-pointer">
          <div class="text-[0.55rem] opacity-40">Drop audio file here</div>
          <div class="text-[0.5rem] opacity-30">or click to browse</div>
          <input id="recording-file" type="file" accept="audio/*" class="hidden" />
        </div>
        <div id="recording-filename" class="text-[0.5rem] opacity-50 mb-2 hidden"></div>
        <input id="recording-url" type="text" placeholder="or paste recording URL"
          class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[0.55rem] mb-2 focus:border-sf-blue focus:outline-none" />
        <button id="btn-upload-recording"
          class="w-full bg-sf-blue/20 border border-sf-blue/30 py-1.5 rounded text-[0.55rem] font-semibold hover:bg-sf-blue/30 transition-colors">
          Upload Recording
        </button>
      </div>

      <!-- Voicemail -->
      <div class="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 mb-3">
        <div class="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <span>&#128232;</span> Voicemail
        </div>
        <div class="mb-2">
          <div class="text-[0.5rem] opacity-50 mb-0.5">From</div>
          <input id="vm-from" type="text" value="090-1234-5678"
            class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[0.55rem] focus:border-sf-blue focus:outline-none" />
        </div>
        <div class="mb-2">
          <div class="text-[0.5rem] opacity-50 mb-0.5">To</div>
          <input id="vm-to" type="text" value="0120-000-000"
            class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[0.55rem] focus:border-sf-blue focus:outline-none" />
        </div>
        <div class="mb-2">
          <div class="text-[0.5rem] opacity-50 mb-0.5">Transcript</div>
          <textarea id="vm-transcript" rows="2" placeholder="Voicemail transcript..."
            class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[0.55rem] focus:border-sf-blue focus:outline-none resize-none"></textarea>
        </div>
        <button id="btn-send-voicemail"
          class="w-full bg-sf-success/20 border border-sf-success/30 py-1.5 rounded text-[0.55rem] font-semibold hover:bg-sf-success/30 transition-colors">
          Send Voicemail
        </button>
      </div>

      <!-- Activity Log -->
      <div class="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3">
        <div class="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <span>&#128203;</span> Activity Log
        </div>
        <div class="text-[0.5rem] opacity-40 mb-2">API calls, responses, errors</div>
        <button id="btn-toggle-log"
          class="w-full bg-white/[0.08] py-1.5 rounded text-[0.55rem] hover:bg-white/[0.12] transition-colors">
          Show Log
        </button>
      </div>
    </div>

    <!-- Log Drawer (hidden) -->
    <div id="log-drawer" class="hidden fixed inset-y-0 right-0 w-96 bg-panel-bg border-l border-white/10 z-40 flex flex-col shadow-2xl">
      <div class="p-3 border-b border-white/[0.06] flex justify-between items-center">
        <span class="text-xs font-bold">Activity Log</span>
        <button id="btn-close-log" class="text-xs opacity-50 hover:opacity-100">Close</button>
      </div>
      <div id="log-entries" class="flex-1 p-3 overflow-y-auto font-mono text-[0.55rem] space-y-2">
      </div>
    </div>
  `;

  // Drop zone
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('recording-file');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-sf-blue/40', 'bg-sf-blue/5');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-sf-blue/40', 'bg-sf-blue/5');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-sf-blue/40', 'bg-sf-blue/5');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      showSelectedFile(e.dataTransfer.files[0].name);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
      showSelectedFile(fileInput.files[0].name);
    }
  });

  // Upload recording
  document.getElementById('btn-upload-recording').addEventListener('click', async () => {
    const call = getActiveCall();
    if (!call) {
      showToast('No active call', 'warning');
      return;
    }
    const url = document.getElementById('recording-url').value.trim();
    if (!url) {
      showToast('Enter a recording URL', 'warning');
      return;
    }
    try {
      await api.patch(`/api/voice-call/${call.vendorCallKey}`, {
        voiceCallId: call.voiceCallId,
        recordingUrl: url,
      });
      addLogEntry('Recording uploaded', 'success');
      showToast('Recording uploaded', 'success');
    } catch (err) {
      addLogEntry(`Recording upload failed: ${err.message}`, 'error');
      showToast(`Recording upload failed: ${err.message}`, 'error');
    }
  });

  // Send voicemail
  document.getElementById('btn-send-voicemail').addEventListener('click', async () => {
    const from = document.getElementById('vm-from').value.trim();
    const to = document.getElementById('vm-to').value.trim();
    const transcripts = document.getElementById('vm-transcript').value.trim();
    if (!from || !to || !transcripts) {
      showToast('Fill in all voicemail fields', 'warning');
      return;
    }
    try {
      await api.post('/api/voicemail', { from, to, transcripts });
      addLogEntry('Voicemail sent', 'success');
      showToast('Voicemail sent', 'success');
    } catch (err) {
      addLogEntry(`Voicemail failed: ${err.message}`, 'error');
      showToast(`Voicemail failed: ${err.message}`, 'error');
    }
  });

  // Log drawer toggle
  document.getElementById('btn-toggle-log').addEventListener('click', () => {
    document.getElementById('log-drawer').classList.remove('hidden');
  });
  document.getElementById('btn-close-log').addEventListener('click', () => {
    document.getElementById('log-drawer').classList.add('hidden');
  });
}

function showSelectedFile(name) {
  const el = document.getElementById('recording-filename');
  el.textContent = `Selected: ${name}`;
  el.classList.remove('hidden');
}

export function addLogEntry(message, type = 'info') {
  const container = document.getElementById('log-entries');
  if (!container) return;

  const colors = {
    info: 'text-white/60',
    success: 'text-sf-success',
    error: 'text-sf-error',
    warning: 'text-sf-orange',
  };

  const entry = document.createElement('div');
  entry.className = `${colors[type] || colors.info} border-b border-white/5 pb-1`;

  const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  entry.innerHTML = `<span class="opacity-40">[${time}]</span> ${message}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;

  logEntries.push({ time, message, type });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/js/tools.js
git commit -m "feat: add tools panel with recording upload, voicemail sender, activity log"
```

---

### Task 11: Frontend — Setup Wizard

**Files:**
- Create: `src/client/setup.html`
- Create: `src/client/js/setup-app.js`
- Create: `src/server/routes/setup.js`

- [ ] **Step 1: Write src/server/routes/setup.js**

```js
import { Router } from 'express';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function createSetupRouter(scrt2Client) {
  const router = Router();

  router.get('/setup/status', (req, res) => {
    const hasEnv = fs.existsSync('.env');
    const hasCerts = fs.existsSync('certs/jwt.key') && fs.existsSync('certs/server.pem');
    const hasConsumerKey = !!process.env.SF_CONSUMER_KEY;

    let sfCliVersion = null;
    try {
      sfCliVersion = execSync('sf version', { encoding: 'utf-8' }).trim();
    } catch { /* not installed */ }

    let nodeVersion = null;
    try {
      nodeVersion = process.version;
    } catch { /* unlikely */ }

    let opensslAvailable = false;
    try {
      execSync('openssl version', { encoding: 'utf-8' });
      opensslAvailable = true;
    } catch { /* not available */ }

    res.json({
      configured: hasEnv && hasCerts && hasConsumerKey,
      hasEnv,
      hasCerts,
      hasConsumerKey,
      sfCliVersion,
      nodeVersion,
      opensslAvailable,
    });
  });

  router.post('/setup/certificate', (req, res) => {
    try {
      const certsDir = 'certs';
      if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir, { recursive: true });
      }

      // Generate server HTTPS cert
      const serverKey = path.join(certsDir, 'server.key');
      const serverPem = path.join(certsDir, 'server.pem');
      if (!fs.existsSync(serverKey)) {
        execSync(
          `openssl req -x509 -newkey rsa:2048 -keyout ${serverKey} -out ${serverPem} -days 365 -nodes -subj "/CN=VoxCanvas Local Dev"`,
          { stdio: 'pipe' }
        );
      }

      // Generate JWT key pair
      const jwtKey = path.join(certsDir, 'jwt.key');
      const jwtPem = path.join(certsDir, 'jwt.pem');
      if (!fs.existsSync(jwtKey)) {
        execSync(`openssl genrsa -out ${jwtKey} 2048`, { stdio: 'pipe' });
        execSync(
          `openssl req -new -x509 -key ${jwtKey} -out ${jwtPem} -days 365 -subj "/CN=VoxCanvas JWT"`,
          { stdio: 'pipe' }
        );
      }

      res.json({ success: true, jwtCertPath: jwtPem });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'CERT_GENERATION_FAILED',
        message: err.message,
      });
    }
  });

  router.get('/setup/certificate/download', (req, res) => {
    const jwtPem = 'certs/jwt.pem';
    if (!fs.existsSync(jwtPem)) {
      return res.status(404).json({
        error: true,
        code: 'CERT_NOT_FOUND',
        message: 'JWT certificate not generated yet. Run certificate generation first.',
      });
    }
    res.download(path.resolve(jwtPem), 'jwt.pem');
  });

  router.post('/setup/complete', (req, res) => {
    try {
      const { consumerKey, username, loginUrl } = req.body;
      if (!consumerKey || !username) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'consumerKey and username are required.',
        });
      }

      const envContent = `# VoxCanvas Configuration (generated by Setup Wizard)
SERVER_PORT=3030
SERVER_HOST=127.0.0.1

# Salesforce Connected App
SF_CONSUMER_KEY=${consumerKey}
SF_USERNAME=${username}
SF_LOGIN_URL=${loginUrl || 'https://login.salesforce.com'}

# Certificate Paths
SF_PRIVATE_KEY_PATH=certs/jwt.key
HTTPS_CERT_PATH=certs/server.pem
HTTPS_KEY_PATH=certs/server.key

# Contact Center (configured at runtime via /api/tenant/configure)
CALL_CENTER_API_NAME=
CALL_CENTER_PHONE=
`;

      fs.writeFileSync('.env', envContent);
      res.json({ success: true, message: 'Configuration saved. Restart server to apply.' });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'SAVE_FAILED',
        message: err.message,
      });
    }
  });

  return router;
}
```

- [ ] **Step 2: Register setup routes in src/server/index.js**

Add after the existing route imports:

```js
import { createSetupRouter } from './routes/setup.js';
```

Add after the existing `app.use('/api', ...)` lines:

```js
app.use('/api', createSetupRouter(scrt2Client));
```

- [ ] **Step 3: Write src/client/setup.html**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VoxCanvas — Setup</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body class="bg-panel-main text-white font-sans min-h-screen flex items-center justify-center">
  <div class="w-full max-w-2xl mx-auto px-6">

    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-2xl font-extrabold tracking-tight mb-2">VoxCanvas Setup</h1>
      <p class="text-sm opacity-50">Connect to your Salesforce org in a few steps</p>
    </div>

    <!-- Step Indicators -->
    <div id="step-indicators" class="flex items-center justify-center gap-2 mb-8">
    </div>

    <!-- Step Content -->
    <div id="step-content" class="bg-panel-bg border border-white/10 rounded-xl p-8">
    </div>

  </div>
  <script type="module" src="/js/setup-app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write src/client/js/setup-app.js**

```js
const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'certificate', label: 'Certificate' },
  { id: 'connected-app', label: 'Connected App' },
  { id: 'test', label: 'Connect' },
  { id: 'complete', label: 'Verify' },
];

let currentStep = 0;
let state = {};

async function init() {
  const status = await fetch('/api/setup/status').then((r) => r.json());
  state = status;
  renderStepIndicators();
  renderStep();
}

function renderStepIndicators() {
  const container = document.getElementById('step-indicators');
  container.innerHTML = STEPS.map(
    (step, i) => `
    <div class="flex items-center gap-1.5">
      <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
        ${i < currentStep ? 'bg-sf-success/40' : i === currentStep ? 'bg-sf-blue/40' : 'bg-white/10'}">
        ${i < currentStep ? '&#10003;' : i + 1}
      </div>
      <span class="text-xs font-medium ${i === currentStep ? 'opacity-100' : 'opacity-40'}">${step.label}</span>
    </div>
    ${i < STEPS.length - 1 ? '<div class="w-6 h-px bg-white/20"></div>' : ''}
  `
  ).join('');
}

function renderStep() {
  renderStepIndicators();
  const container = document.getElementById('step-content');

  switch (STEPS[currentStep].id) {
    case 'welcome':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Welcome to VoxCanvas Setup</h2>
        <p class="text-sm opacity-60 mb-6 leading-relaxed">This wizard will help you connect VoxCanvas to your Salesforce org. You need a Salesforce org with Service Cloud Voice (Partner Telephony) enabled.</p>
        <div class="text-sm font-semibold mb-3">Environment Check:</div>
        <div class="space-y-2 mb-6">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-sf-success">&#10003;</span> Node.js ${state.nodeVersion || 'detected'}
          </div>
          <div class="flex items-center gap-2 text-sm">
            ${state.opensslAvailable ? '<span class="text-sf-success">&#10003;</span> OpenSSL available' : '<span class="text-sf-error">&#10007;</span> OpenSSL not found (required)'}
          </div>
          <div class="flex items-center gap-2 text-sm">
            ${state.sfCliVersion ? `<span class="text-sf-success">&#10003;</span> Salesforce CLI: ${state.sfCliVersion}` : '<span class="text-sf-orange">&#9888;</span> Salesforce CLI not found <span class="opacity-40">(optional)</span>'}
          </div>
        </div>
        <div class="flex justify-end">
          <button onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold transition-colors">Next &rarr;</button>
        </div>
      `;
      break;

    case 'certificate':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Certificate Generation</h2>
        <p class="text-sm opacity-60 mb-6">Generate certificates for HTTPS and JWT authentication.</p>
        <div class="flex gap-4 mb-6">
          <button id="btn-generate-certs" class="flex-1 bg-sf-success/10 border border-sf-success/30 rounded-lg p-4 text-left hover:bg-sf-success/20 transition-colors">
            <div class="text-sm font-bold text-sf-success mb-1">&#9889; Auto-Generate (Recommended)</div>
            <div class="text-xs opacity-50">RSA 2048-bit self-signed certificates</div>
          </button>
        </div>
        <div id="cert-result" class="hidden bg-sf-success/10 border border-sf-success/30 rounded-lg p-3 mb-4 text-sm"></div>
        <div class="flex justify-between">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm transition-colors">&larr; Back</button>
          <button id="btn-cert-next" onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold transition-colors opacity-30 pointer-events-none">Next &rarr;</button>
        </div>
      `;
      document.getElementById('btn-generate-certs').addEventListener('click', async () => {
        const result = await fetch('/api/setup/certificate', { method: 'POST' }).then((r) => r.json());
        if (result.success) {
          document.getElementById('cert-result').classList.remove('hidden');
          document.getElementById('cert-result').innerHTML =
            '&#10003; Certificates generated. <a href="/api/setup/certificate/download" class="underline text-sf-blue">Download jwt.pem</a> for the Connected App.';
          const btn = document.getElementById('btn-cert-next');
          btn.classList.remove('opacity-30', 'pointer-events-none');
        }
      });
      break;

    case 'connected-app':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Connected App Configuration</h2>
        <div class="text-sm opacity-60 mb-4 leading-relaxed">
          In your Salesforce org:<br>
          1. Setup &rarr; App Manager &rarr; New Connected App<br>
          2. Enable OAuth, select scopes: <code class="bg-white/10 px-1 rounded text-xs">api</code>, <code class="bg-white/10 px-1 rounded text-xs">refresh_token</code><br>
          3. Upload the <a href="/api/setup/certificate/download" class="underline text-sf-blue">jwt.pem</a> certificate<br>
          4. Copy the Consumer Key below
        </div>
        <div class="space-y-3 mb-6">
          <div>
            <label class="text-xs opacity-50 mb-1 block">Consumer Key (Client ID)</label>
            <input id="setup-consumer-key" type="text" placeholder="3MVG9..."
              class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm font-mono focus:border-sf-blue focus:outline-none" />
          </div>
          <div>
            <label class="text-xs opacity-50 mb-1 block">Salesforce Username</label>
            <input id="setup-username" type="text" placeholder="admin@myorg.com"
              class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-sf-blue focus:outline-none" />
          </div>
          <div>
            <label class="text-xs opacity-50 mb-1 block">Login URL</label>
            <div class="flex gap-2">
              <button class="login-url-btn bg-sf-blue/30 px-3 py-1.5 rounded text-xs font-medium" data-url="https://login.salesforce.com">login.salesforce.com</button>
              <button class="login-url-btn bg-white/10 px-3 py-1.5 rounded text-xs font-medium" data-url="https://test.salesforce.com">test.salesforce.com</button>
            </div>
            <input id="setup-login-url" type="hidden" value="https://login.salesforce.com" />
          </div>
        </div>
        <div class="flex justify-between">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm transition-colors">&larr; Back</button>
          <button onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold transition-colors">Next &rarr;</button>
        </div>
      `;
      document.querySelectorAll('.login-url-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.login-url-btn').forEach((b) => (b.className = 'login-url-btn bg-white/10 px-3 py-1.5 rounded text-xs font-medium'));
          btn.className = 'login-url-btn bg-sf-blue/30 px-3 py-1.5 rounded text-xs font-medium';
          document.getElementById('setup-login-url').value = btn.dataset.url;
        });
      });
      break;

    case 'test':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Test Connection</h2>
        <div class="text-center py-6">
          <button id="btn-test-connection" class="bg-sf-blue/30 hover:bg-sf-blue/50 px-8 py-3 rounded-lg text-sm font-bold transition-colors">Test Connection</button>
          <div id="test-results" class="mt-6 space-y-2 max-w-xs mx-auto hidden"></div>
        </div>
        <div class="flex justify-between mt-4">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm transition-colors">&larr; Back</button>
          <button id="btn-test-next" onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold transition-colors opacity-30 pointer-events-none">Next &rarr;</button>
        </div>
      `;
      document.getElementById('btn-test-connection').addEventListener('click', async () => {
        const resultsDiv = document.getElementById('test-results');
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML = '<div class="text-sm opacity-50">Saving configuration...</div>';

        const consumerKey = document.getElementById('setup-consumer-key')?.value || state.consumerKey || '';
        const username = document.getElementById('setup-username')?.value || state.username || '';
        const loginUrl = document.getElementById('setup-login-url')?.value || 'https://login.salesforce.com';

        const saveResult = await fetch('/api/setup/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consumerKey, username, loginUrl }),
        }).then((r) => r.json());

        if (saveResult.success) {
          resultsDiv.innerHTML = `
            <div class="flex items-center gap-2 text-sm"><span class="text-sf-success">&#10003;</span> Configuration saved</div>
            <div class="flex items-center gap-2 text-sm"><span class="text-sf-orange">&#9888;</span> Restart server to test JWT auth</div>
          `;
          const btn = document.getElementById('btn-test-next');
          btn.classList.remove('opacity-30', 'pointer-events-none');
        } else {
          resultsDiv.innerHTML = `<div class="text-sm text-sf-error">&#10007; ${saveResult.message}</div>`;
        }
      });
      break;

    case 'complete':
      container.innerHTML = `
        <div class="text-center py-8">
          <div class="text-4xl mb-4">&#10003;</div>
          <h2 class="text-xl font-bold text-sf-success mb-2">VoxCanvas is ready!</h2>
          <p class="text-sm opacity-50 mb-6">Configuration saved. Restart the server and open the dashboard.</p>
          <a href="/" class="inline-block bg-sf-blue/40 hover:bg-sf-blue/60 px-8 py-3 rounded-lg text-sm font-bold transition-colors">Open Dashboard &rarr;</a>
        </div>
      `;
      break;
  }
}

function nextStep() {
  if (currentStep < STEPS.length - 1) {
    currentStep++;
    renderStep();
  }
}

function prevStep() {
  if (currentStep > 0) {
    currentStep--;
    renderStep();
  }
}

// Expose to inline onclick handlers
window.nextStep = nextStep;
window.prevStep = prevStep;

init();
```

- [ ] **Step 5: Add Vite multi-page config**

Update `vite.config.js` to include `setup.html`:

```js
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/client',
  plugins: [tailwindcss()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/client/index.html'),
        setup: resolve(__dirname, 'src/client/setup.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:3030',
        secure: false,
      },
    },
  },
});
```

- [ ] **Step 6: Add setup.html fallback to src/server/index.js**

Update the static file serving section:

```js
// Serve static files in production
const distPath = path.resolve(__dirname, '../../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/setup', (req, res) => {
    res.sendFile(path.join(distPath, 'setup.html'));
  });
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add src/server/routes/setup.js src/client/setup.html src/client/js/setup-app.js src/server/index.js vite.config.js
git commit -m "feat: add setup wizard with certificate generation, Connected App guide, and test connection"
```

---

### Task 12: Integration Test — Full Dev Flow

**Files:** None created — this is a manual verification task.

- [ ] **Step 1: Generate certificates**

```bash
npm run init
```

Expected: Certificates in `certs/`, `.env` created.

- [ ] **Step 2: Start dev mode**

```bash
npm run dev
```

Expected: Concurrently starts Express (port 3030) and Vite (port 5173). No errors.

- [ ] **Step 3: Open dashboard in browser**

Open `http://localhost:5173` in Chrome/Edge.

Expected: Dashboard loads with 3-column layout. Header shows "Not Configured" or "Server Offline" status.

- [ ] **Step 4: Verify health endpoint via Vite proxy**

Open browser devtools console:

```js
fetch('/api/health').then(r => r.json()).then(console.log)
```

Expected: `{status: "ok", configured: false, ...}`

- [ ] **Step 5: Open setup wizard**

Navigate to `http://localhost:5173/setup.html`.

Expected: 5-step wizard renders. Step 1 shows environment check results.

- [ ] **Step 6: Test certificate generation through wizard**

Click "Auto-Generate" in Step 2.

Expected: Success message and download link for `jwt.pem`.

- [ ] **Step 7: Verify build works**

```bash
npm run build
```

Expected: `dist/` directory created with `index.html`, `setup.html`, and bundled assets.

- [ ] **Step 8: Verify production mode**

```bash
npm start
```

Open `https://127.0.0.1:3030` (accept self-signed cert warning).

Expected: Dashboard loads from `dist/`. Setup available at `https://127.0.0.1:3030/setup`.

- [ ] **Step 9: Commit any fixes**

If any issues were found and fixed, commit them:

```bash
git add -A
git commit -m "fix: integration test fixes for dev and production modes"
```

---

### Task 13: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

```markdown
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

Open `http://localhost:5173` for the dashboard.

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

1. Open VoxCanvas Dashboard (`https://127.0.0.1:3030`)
2. In Salesforce: Omni-Channel → Set status to "Available for Phone"
3. VoxCanvas: Select Inbound/Outbound → Enter phone numbers → **Start Call**
4. Salesforce: Accept the incoming call
5. VoxCanvas: Type in Customer panel (left) and Agent panel (right)
6. Watch messages appear in Salesforce Enhanced Conversation
7. (Optional) Upload recording or send voicemail from Tools panel
8. **End Call** to finish

## Important Notes

- Use `127.0.0.1` not `localhost` (CORS requirement)
- Accept the self-signed certificate warning on first visit
- Permission set names use "Partner Telephony" not "BYOT"
- Contact Center XML must be deployed via Metadata API, not UI wizard
- Metadata type is `ConversationVendorInfo` (not `ConversationVendorInformation`)

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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions, demo flow, and important notes"
```
