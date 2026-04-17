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
import { createSetupRouter } from './routes/setup.js';

// Bumped whenever the setup router / sf parse pipeline changes. Surfaced
// via /api/setup/status so the UI can confirm it is talking to the
// version of the server it expects (avoids stale-nodemon / wrong-branch
// confusion during wizard debugging).
const SETUP_SERVER_VERSION = 'wizard-cc-4';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Server binds to 127.0.0.1 by default; this just makes req.ip honor that
// when running behind Vite's dev proxy (still loopback-only).
app.set('trust proxy', 'loopback');

const scrt2Client = new Scrt2Client({
  scrtBaseUrl: process.env.SF_SCRT_BASE_URL || '',
  orgId: process.env.SF_ORG_ID || '',
  callCenterApiName: process.env.CALL_CENTER_API_NAME || '',
  privateKeyPath: process.env.SF_PRIVATE_KEY_PATH || 'certs/jwt.key',
  callCenterPhone: process.env.CALL_CENTER_PHONE || '',
});

app.use('/api', createHealthRouter(scrt2Client));
app.use('/api', createTenantRouter(scrt2Client));
app.use('/api', createVoiceCallRouter(scrt2Client));
app.use('/api', createTranscriptionRouter(scrt2Client));
app.use('/api', createVoicemailRouter(scrt2Client));
const { router: setupRouter, registry: setupRegistry } = createSetupRouter(scrt2Client);
app.use('/api', setupRouter);

// Version probe: lets the UI confirm the server is not stale after a pull.
app.get('/api/setup/version', (req, res) => {
  res.json({ version: SETUP_SERVER_VERSION });
});

function shutdown() {
  console.log('Shutting down, stopping wizard-spawned processes...');
  setupRegistry.stopAll().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Any /api/* path that nothing matched above is a 404. Without this,
// Express 5's catch-all below would either hang (no response) or return
// the SPA HTML for an API call.
app.use('/api', (req, res) => {
  res.status(404).json({ error: true, code: 'NOT_FOUND', path: req.originalUrl });
});

const distPath = path.resolve(__dirname, '../../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/setup', (req, res) => {
    res.sendFile(path.join(distPath, 'setup.html'));
  });
  app.get('{*path}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

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
    console.log(`\nVoxCanvas server running at https://${host}:${port}  [setup=${SETUP_SERVER_VERSION}]`);
    console.log(`Dashboard: https://${host}:${port}/`);
  });
} else {
  app.listen(port, host, () => {
    console.log(`\nVoxCanvas server running at http://${host}:${port} (no HTTPS certs found)  [setup=${SETUP_SERVER_VERSION}]`);
    console.log(`Run 'npm run init' to generate certificates.`);
  });
}
