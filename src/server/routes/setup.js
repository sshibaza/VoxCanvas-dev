import { Router } from 'express';
import { execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../setup/logger.js';
import { ProcessRegistry } from '../setup/processRegistry.js';
import { stripAnsi } from '../setup/sfRunner.js';

function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  return send;
}

// Restrict destructive setup endpoints to local calls only. The wizard
// generates certs, runs openssl, and writes .env — not something we want
// reachable from the LAN if someone binds to 0.0.0.0 or runs behind a proxy.
function localhostOnly(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const isLocal =
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === '';
  if (!isLocal) {
    return res.status(403).json({
      error: true,
      code: 'LOCALHOST_ONLY',
      message: 'Setup endpoints are only accessible from localhost.',
    });
  }
  next();
}

// Reject any character that could break out of a KEY=VALUE line in .env
// (newline, quotes, backtick, $, backslash) or break an OAuth username format.
const SAFE_VALUE = /^[A-Za-z0-9._@+\-:/ ]*$/;
function sanitizeEnvValue(value, field) {
  if (value == null) return '';
  const str = String(value).trim();
  if (!SAFE_VALUE.test(str)) {
    const err = new Error(`Invalid characters in ${field}.`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return str;
}

export function createSetupRouter(scrt2Client) {
  const router = Router();
  router.use('/setup', localhostOnly);

  const logger = new Logger();
  const registry = new ProcessRegistry();
  const routerState = {
    selectedOrgAlias: null,
    selectedOrgUsername: null,
    lastRunIds: {},
    ngrok: null, // { url, pid, runId } while ngrok tunnel is live
  };

  router.get('/setup/status', (req, res) => {
    const hasEnv = fs.existsSync('.env');
    const hasCerts = fs.existsSync('certs/jwt.key') && fs.existsSync('certs/server.pem');

    let sfCliVersion = null;
    try {
      sfCliVersion = execSync('sf version', { encoding: 'utf-8' }).trim();
    } catch { /* not installed */ }

    let ngrokVersion = null;
    try {
      ngrokVersion = execSync('ngrok version', { encoding: 'utf-8' }).trim();
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
      configured: hasEnv && hasCerts,
      hasEnv,
      hasCerts,
      sfCliVersion,
      ngrokVersion,
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
        fs.chmodSync(serverKey, 0o600);
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
        fs.chmodSync(jwtKey, 0o600);
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

  router.get('/setup/public-key', (req, res) => {
    const jwtPem = 'certs/jwt.pem';
    if (!fs.existsSync(jwtPem)) {
      return res.status(404).json({
        error: true,
        code: 'CERT_NOT_FOUND',
        message: 'JWT certificate not generated yet. Run certificate generation first.',
      });
    }
    try {
      const pem = fs.readFileSync(jwtPem, 'utf-8');
      res.type('text/plain').send(pem);
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'READ_FAILED',
        message: err.message,
      });
    }
  });

  router.post('/setup/complete', async (req, res) => {
    try {
      const { scrtBaseUrl, orgId, callCenterApiName, callCenterPhone } = req.body;
      if (!scrtBaseUrl || !orgId || !callCenterApiName) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'scrtBaseUrl, orgId, and callCenterApiName are required.',
        });
      }

      const safe = {
        scrtBaseUrl: sanitizeEnvValue(scrtBaseUrl, 'scrtBaseUrl'),
        orgId: sanitizeEnvValue(orgId, 'orgId'),
        callCenterApiName: sanitizeEnvValue(callCenterApiName, 'callCenterApiName'),
        callCenterPhone: sanitizeEnvValue(callCenterPhone || '', 'callCenterPhone'),
      };

      const envContent = `# VoxCanvas Configuration (generated by Setup Wizard)
SERVER_PORT=3030
SERVER_HOST=127.0.0.1

# Certificate Paths
SF_PRIVATE_KEY_PATH=certs/jwt.key
HTTPS_CERT_PATH=certs/server.pem
HTTPS_KEY_PATH=certs/server.key

# Salesforce Tenant / Contact Center
SF_SCRT_BASE_URL=${safe.scrtBaseUrl}
SF_ORG_ID=${safe.orgId}
CALL_CENTER_API_NAME=${safe.callCenterApiName}
CALL_CENTER_PHONE=${safe.callCenterPhone}
`;

      fs.writeFileSync('.env', envContent);
      fs.chmodSync('.env', 0o600);

      scrt2Client.configure({
        scrtBaseUrl: safe.scrtBaseUrl,
        orgId: safe.orgId,
        callCenterApiName: safe.callCenterApiName,
      });

      const { cleanupAllTmpDirs } = await import('../setup/metadataRenderer.js');
      const cleanup = req.body?.cleanup || {};
      const cleanupResult = { logsDeleted: 0, tmpDirsDeleted: 0, processesStopped: [] };
      if (cleanup.deleteLogs) {
        cleanupResult.logsDeleted = logger.deleteAll();
      }
      if (cleanup.deleteTmp) {
        cleanupResult.tmpDirsDeleted = cleanupAllTmpDirs();
      }
      if (Array.isArray(cleanup.stopProcesses)) {
        for (const name of cleanup.stopProcesses) {
          if (await registry.stop(name)) cleanupResult.processesStopped.push(name);
        }
      }
      res.json({ success: true, message: 'Configuration saved.', cleanup: cleanupResult });
    } catch (err) {
      const status = err.code === 'INVALID_INPUT' ? 400 : 500;
      res.status(status).json({
        error: true,
        code: err.code || 'SAVE_FAILED',
        message: err.message,
      });
    }
  });

  // Extract the outermost JSON object/array from arbitrary text. sf CLI
  // sometimes prefixes JSON with warnings (update banners) or colour codes
  // that neither NO_COLOR nor stripAnsi catch. Rather than chase every
  // escape sequence, slice from the first { or [ to the matching last
  // } or ]. Safe because sf's --json contract is a single root value.
  function extractJsonBlob(text) {
    if (!text) return text;
    const firstObj = text.indexOf('{');
    const firstArr = text.indexOf('[');
    let start = -1;
    if (firstObj === -1) start = firstArr;
    else if (firstArr === -1) start = firstObj;
    else start = Math.min(firstObj, firstArr);
    if (start < 0) return text;
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (end <= start) return text;
    return text.slice(start, end + 1);
  }

  function parseSfOutput(stdout) {
    const cleaned = stripAnsi(stdout);
    try {
      return JSON.parse(cleaned);
    } catch (parseErr) {
      const extracted = extractJsonBlob(cleaned);
      try {
        return JSON.parse(extracted);
      } catch {
        // Surface a useful snippet so troubleshooting doesn't require
        // server-side logs — the client will see what sf actually printed.
        const snippet = cleaned.slice(0, 200).replace(/\s+/g, ' ').trim();
        const rawSnippet = stdout.slice(0, 200).replace(/\s+/g, ' ').trim();
        const e = new Error(`[VoxCanvas wizard-cc-10] sf CLI returned unparseable output. Cleaned head: "${snippet}". Raw head: "${rawSnippet}". Parse error: ${parseErr.message}`);
        e.code = 'SF_JSON_PARSE_FAILED';
        throw e;
      }
    }
  }

  function runSfJson(args) {
    // Capture stderr in the thrown error so the client sees real failures
    // (e.g. sf not on PATH, auth expired) instead of an opaque 500.
    // NO_COLOR / FORCE_COLOR=0 / TERM=dumb all disable colour output in
    // sf CLI's chalk; we set NO_COLOR as the most widely respected.
    try {
      const stdout = execFileSync('sf', args, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TERM: 'dumb' },
      });
      return parseSfOutput(stdout);
    } catch (err) {
      if (err.code === 'SF_JSON_PARSE_FAILED') throw err;
      const stderr = err.stderr ? err.stderr.toString().trim() : '';
      const msg = stderr || err.message;
      const e = new Error(msg);
      e.code = err.code || 'SF_EXEC_FAILED';
      throw e;
    }
  }

  router.get('/setup/org', (req, res) => {
    try {
      const parsed = runSfJson(['config', 'get', 'target-org', '--json']);
      // sf config get returns an array where each entry may or may not have `value`.
      // Newer CLI versions also use `success: false` on entries without a value.
      const entry = parsed?.result?.find?.((x) => x?.name === 'target-org' && x?.value) || parsed?.result?.[0];
      const alias = entry?.value || null;
      if (!alias) {
        return res.json({ hasDefault: false });
      }
      const display = runSfJson(['org', 'display', '--target-org', alias, '--json']);
      const r = display?.result || {};
      const myDomainUrl = r.instanceUrl || '';
      const scrtBaseUrl = myDomainUrl.replace('.my.salesforce.com', '.my.salesforce-scrt.com');
      res.json({
        hasDefault: true,
        alias,
        username: r.username,
        orgId: r.id,
        instanceUrl: r.instanceUrl,
        myDomainUrl,
        scrtBaseUrl,
      });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SF_ORG_FAILED', message: err.message });
    }
  });

  router.get('/setup/org/list', (req, res) => {
    try {
      const out = runSfJson(['org', 'list', '--json']);
      // sf CLI v2+ splits orgs across multiple buckets. Union them all so
      // dev hubs / sandboxes / "other" orgs are not silently dropped.
      const buckets = ['nonScratchOrgs', 'scratchOrgs', 'devHubs', 'sandboxes', 'other'];
      const seen = new Set();
      const orgs = [];
      for (const key of buckets) {
        for (const o of out?.result?.[key] || []) {
          const id = o.username || o.alias || o.orgId;
          if (id && !seen.has(id)) {
            seen.add(id);
            orgs.push({
              alias: o.alias || null,
              username: o.username,
              instanceUrl: o.instanceUrl,
              isDefault: !!o.isDefaultUsername || !!o.isDefaultDevHubUsername,
              bucket: key,
            });
          }
        }
      }
      res.json({ orgs });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SF_LIST_FAILED', message: err.message });
    }
  });

  router.post('/setup/org/select', async (req, res) => {
    const { alias } = req.body || {};
    if (!alias || !/^[A-Za-z0-9._@+-]+$/.test(alias)) {
      return res.status(400).json({ error: true, code: 'INVALID_ALIAS', message: 'alias or username required (alnum/._@+-)' });
    }
    try {
      const display = runSfJson(['org', 'display', '--target-org', alias, '--json']);
      const r = display?.result || {};
      routerState.selectedOrgAlias = alias;
      routerState.selectedOrgUsername = r.username;
      const myDomainUrl = r.instanceUrl || '';
      const scrtBaseUrl = myDomainUrl.replace('.my.salesforce.com', '.my.salesforce-scrt.com');
      res.json({ alias, username: r.username, orgId: r.id, instanceUrl: r.instanceUrl, myDomainUrl, scrtBaseUrl });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SF_DISPLAY_FAILED', message: err.message });
    }
  });

  router.post('/setup/org/login', async (req, res) => {
    const { alias } = req.body || {};
    if (!alias || !/^[A-Za-z0-9._@+-]+$/.test(alias)) {
      return res.status(400).json({ error: true, code: 'INVALID_ALIAS', message: 'alias or username required (alnum/._@+-)' });
    }
    const { randomUUID } = await import('node:crypto');
    const runId = randomUUID();
    logger.open(runId);
    routerState.lastRunIds.orgLogin = runId;
    const send = openSse(res);
    const unsubscribe = logger.subscribe(runId, (ev) => send('log', ev));
    send('log', { ts: new Date().toISOString(), level: 'info', step: 'org-login', action: 'prepare', message: `Launching sf org login web --alias ${alias}` });
    try {
      const { runCommand } = await import('../setup/sfRunner.js');
      const { exitCode } = await runCommand({
        command: 'sf',
        args: ['org', 'login', 'web', '--alias', alias],
        onLine: (line, stream) => logger.log(runId, { level: stream === 'stderr' ? 'error' : 'info', step: 'org-login', action: 'sf-exec', message: line }),
      });
      send('done', { success: exitCode === 0, runId, exitCode });
    } catch (err) {
      send('done', { success: false, runId, message: err.message });
    } finally {
      unsubscribe();
      await logger.close(runId);
      res.end();
    }
  });

  router.get('/setup/cc/check', (req, res) => {
    const name = String(req.query.name || '');
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      return res.status(400).json({ error: true, code: 'INVALID_NAME', message: 'name must be alphanumeric + _' });
    }
    if (!routerState.selectedOrgAlias) {
      return res.status(400).json({ error: true, code: 'NO_ORG_SELECTED', message: 'select an org first' });
    }
    try {
      // name and selectedOrgAlias are regex-validated elsewhere, but we still
      // avoid shell interpolation and build SOQL via argv-only args.
      const soql = `SELECT Id, DeveloperName FROM ContactCenter WHERE DeveloperName = '${name}'`;
      const out = runSfJson(['data', 'query', '-q', soql, '--target-org', routerState.selectedOrgAlias, '--json']);
      const records = out?.result?.records || [];
      res.json({ exists: records.length > 0, id: records[0]?.Id || null });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SF_QUERY_FAILED', message: err.message });
    }
  });

  router.post('/setup/cc/deploy', async (req, res) => {
    const { serviceEndpoint, developerName, masterLabel } = req.body || {};
    if (!serviceEndpoint || !developerName || !masterLabel) {
      return res.status(400).json({ error: true, code: 'MISSING_FIELDS', message: 'serviceEndpoint, developerName, masterLabel required' });
    }
    if (!/^https:\/\/[A-Za-z0-9.\-/_:]+$/.test(serviceEndpoint)) {
      return res.status(400).json({ error: true, code: 'INVALID_ENDPOINT', message: 'serviceEndpoint must be https URL' });
    }
    if (!/^[A-Za-z0-9_]+$/.test(developerName)) {
      return res.status(400).json({ error: true, code: 'INVALID_NAME', message: 'developerName must be alphanumeric + _' });
    }
    if (!routerState.selectedOrgAlias) {
      return res.status(400).json({ error: true, code: 'NO_ORG_SELECTED', message: 'select an org first' });
    }
    const jwtPem = 'certs/jwt.pem';
    if (!fs.existsSync(jwtPem)) {
      return res.status(400).json({ error: true, code: 'NO_CERT', message: 'run certificate step first' });
    }

    const { randomUUID } = await import('node:crypto');
    const { renderMetadata } = await import('../setup/metadataRenderer.js');
    const { runCommand } = await import('../setup/sfRunner.js');
    const { matchHint } = await import('../setup/hints.js');

    const runId = randomUUID();
    logger.open(runId);
    routerState.lastRunIds.ccDeploy = runId;
    const send = openSse(res);
    const unsubscribe = logger.subscribe(runId, (ev) => send('log', ev));

    let rendered = null;
    try {
      const pem = fs.readFileSync(jwtPem, 'utf-8');
      logger.log(runId, { level: 'info', step: 'deploy', action: 'prepare', message: `Rendering metadata (endpoint=${serviceEndpoint}, vendor=VoxCanvas)` });
      rendered = renderMetadata({
        templatesDir: path.resolve('metadata/voxcanvas-contact-center'),
        values: { SERVICE_ENDPOINT: serviceEndpoint },
      });

      // --- Phase 1: Deploy ConversationVendorInfo via Metadata API ---
      // ContactCenter is NOT a Metadata API type, so package.xml only
      // references ConversationVendorInfo. The CC record is created
      // via REST in Phase 2.
      logger.log(runId, { level: 'info', step: 'deploy', action: 'sf-exec', message: `(cwd=${rendered.tmpDir}) sf project deploy start --metadata-dir ${rendered.metadataDir} --target-org ${routerState.selectedOrgAlias}` });
      const { exitCode } = await runCommand({
        command: 'sf',
        args: ['project', 'deploy', 'start', '--metadata-dir', rendered.metadataDir, '--target-org', routerState.selectedOrgAlias, '--json'],
        cwd: rendered.tmpDir,
        onLine: (line, stream) => {
          logger.log(runId, { level: stream === 'stderr' ? 'error' : 'info', step: 'deploy', action: 'sf-exec', message: line });
          const hint = matchHint(line);
          if (hint) logger.log(runId, { level: 'hint', step: 'deploy', action: 'hint', message: hint });
        },
      });
      if (exitCode !== 0) {
        send('done', { success: false, runId, exitCode, message: 'ConversationVendorInfo deploy failed' });
        return;
      }
      logger.log(runId, { level: 'info', step: 'deploy', action: 'done', message: 'Phase 1: ConversationVendorInfo deployed successfully' });

      // --- Phase 2: Create ContactCenter sObject record via REST ---
      logger.log(runId, { level: 'info', step: 'deploy', action: 'prepare', message: 'Phase 2: Creating ContactCenter record via REST API' });
      const display = runSfJson(['org', 'display', '--target-org', routerState.selectedOrgAlias, '--verbose', '--json']);
      const { accessToken, instanceUrl } = display?.result || {};
      if (!accessToken || !instanceUrl) {
        throw new Error('sf org display did not return accessToken or instanceUrl');
      }

      const axios = (await import('axios')).default;
      const apiVersion = 'v63.0';
      const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

      // 2a: describe ContactCenter so we can (i) assert it exists in this
      // org and (ii) confirm the exact field names the REST body must use.
      // Field names we previously guessed (ConversationVendorInfoId etc.)
      // may have drifted as the object evolves across releases; fail fast
      // with a usable error instead of a generic 400 from create.
      const expectedFields = ['DeveloperName', 'MasterLabel', 'PublicKey'];
      logger.log(runId, { level: 'info', step: 'deploy', action: 'rest', message: `GET /sobjects/ContactCenter/describe (validate field names)` });
      const describeResp = await axios.get(
        `${instanceUrl}/services/data/${apiVersion}/sobjects/ContactCenter/describe`,
        { headers: auth, validateStatus: () => true },
      );
      if (describeResp.status !== 200) {
        throw new Error(`ContactCenter describe failed (${describeResp.status}): ${JSON.stringify(describeResp.data)}. ` +
          `The org likely does not have Service Cloud Voice for Partner Telephony enabled, or the user lacks access to ContactCenter.`);
      }
      const fieldNames = (describeResp.data?.fields || []).map((f) => f.name);
      const missingExpected = expectedFields.filter((n) => !fieldNames.includes(n));
      if (missingExpected.length) {
        logger.log(runId, { level: 'warn', step: 'deploy', action: 'rest', message: `ContactCenter is missing expected fields: ${missingExpected.join(', ')}. Available: ${fieldNames.join(', ')}` });
      }
      // Detect the vendor-reference field dynamically. It may be named
      // ConversationVendorInfoId or ConversationVendorInformationId, or
      // something else on newer releases.
      const vendorLookupField = fieldNames.find((n) => /^ConversationVendor(Info|Information)Id$/i.test(n));
      if (!vendorLookupField) {
        throw new Error(`ContactCenter has no vendor-reference field (looked for ConversationVendorInfoId / ConversationVendorInformationId). Available fields: ${fieldNames.join(', ')}`);
      }
      logger.log(runId, { level: 'info', step: 'deploy', action: 'rest', message: `Vendor lookup field: ${vendorLookupField}` });

      // 2b: look up the vendor we just deployed
      const vendorQuery = `SELECT Id FROM ConversationVendorInfo WHERE DeveloperName = 'VoxCanvas'`;
      logger.log(runId, { level: 'info', step: 'deploy', action: 'rest', message: `GET query ${vendorQuery}` });
      const vendorResp = await axios.get(
        `${instanceUrl}/services/data/${apiVersion}/query/?q=${encodeURIComponent(vendorQuery)}`,
        { headers: auth, validateStatus: () => true },
      );
      if (vendorResp.status !== 200 || !vendorResp.data?.records?.length) {
        throw new Error(`ConversationVendorInfo 'VoxCanvas' not found after deploy: ${JSON.stringify(vendorResp.data)}`);
      }
      const vendorId = vendorResp.data.records[0].Id;
      logger.log(runId, { level: 'info', step: 'deploy', action: 'rest', message: `Vendor Id: ${vendorId}` });

      // 2c: create the ContactCenter sObject record
      const ccBody = {
        DeveloperName: developerName,
        MasterLabel: masterLabel,
        [vendorLookupField]: vendorId,
        PublicKey: pem,
      };
      logger.log(runId, { level: 'info', step: 'deploy', action: 'rest', message: `POST /sobjects/ContactCenter ${JSON.stringify({ ...ccBody, PublicKey: '<pem hidden>' })}` });
      const ccResp = await axios.post(
        `${instanceUrl}/services/data/${apiVersion}/sobjects/ContactCenter/`,
        ccBody,
        { headers: auth, validateStatus: () => true },
      );
      if (ccResp.status < 200 || ccResp.status >= 300 || !ccResp.data?.success) {
        const errDetail = JSON.stringify(ccResp.data);
        logger.log(runId, { level: 'error', step: 'deploy', action: 'rest', message: `ContactCenter create failed (${ccResp.status}): ${errDetail}` });
        throw new Error(`ContactCenter create failed: ${errDetail}`);
      }
      const contactCenterId = ccResp.data.id;
      logger.log(runId, { level: 'info', step: 'deploy', action: 'done', message: `ContactCenter created: ${contactCenterId}` });

      send('done', { success: true, runId, exitCode: 0, callCenterApiName: developerName, contactCenterId });
    } catch (err) {
      logger.log(runId, { level: 'error', step: 'deploy', action: 'sf-exec', message: err.message });
      const hint = matchHint(err.message);
      if (hint) logger.log(runId, { level: 'hint', step: 'deploy', action: 'hint', message: hint });
      send('done', { success: false, runId, message: err.message });
    } finally {
      rendered?.cleanup();
      unsubscribe();
      await logger.close(runId);
      res.end();
    }
  });

  router.post('/setup/permset/assign', async (req, res) => {
    const { permsetNames, targetUser } = req.body || {};
    if (!Array.isArray(permsetNames) || permsetNames.length === 0) {
      return res.status(400).json({ error: true, code: 'MISSING_PERMSETS', message: 'permsetNames array required' });
    }
    for (const n of permsetNames) {
      if (!/^[A-Za-z0-9_]+$/.test(n)) {
        return res.status(400).json({ error: true, code: 'INVALID_PERMSET', message: `bad permset: ${n}` });
      }
    }
    if (targetUser && !/^[A-Za-z0-9._@+-]+$/.test(targetUser)) {
      return res.status(400).json({ error: true, code: 'INVALID_USER', message: 'bad targetUser format' });
    }
    if (!routerState.selectedOrgAlias) {
      return res.status(400).json({ error: true, code: 'NO_ORG_SELECTED', message: 'select an org first' });
    }

    const { randomUUID } = await import('node:crypto');
    const { runCommand } = await import('../setup/sfRunner.js');
    const { matchHint } = await import('../setup/hints.js');

    const runId = randomUUID();
    logger.open(runId);
    routerState.lastRunIds.permset = runId;
    const send = openSse(res);
    const unsubscribe = logger.subscribe(runId, (ev) => send('log', ev));

    const results = [];
    try {
      // Verify each permset exists in the target org before we try to
      // assign it — otherwise `sf org assign permset` fails with a
      // generic error per name. Fail-fast with a clear list of missing
      // names so the user can spot a typo or an unlicensed feature.
      logger.log(runId, { level: 'info', step: 'permset', action: 'sf-exec', message: `Verifying permsets exist: ${permsetNames.join(', ')}` });
      const names = permsetNames.map((n) => `'${n}'`).join(', ');
      const lookupQuery = `SELECT Name FROM PermissionSet WHERE Name IN (${names})`;
      const lookup = runSfJson(['data', 'query', '-q', lookupQuery, '--target-org', routerState.selectedOrgAlias, '--json']);
      const found = new Set((lookup?.result?.records || []).map((r) => r.Name));
      const missing = permsetNames.filter((n) => !found.has(n));
      if (missing.length) {
        const hintMsg = `Permission sets not found in org: ${missing.join(', ')}. ` +
          `This usually means Service Cloud Voice for Partner Telephony is not fully enabled on this org ` +
          `(Setup → Feature Settings → Service → Partner Telephony), or a license is missing.`;
        logger.log(runId, { level: 'error', step: 'permset', action: 'hint', message: hintMsg });
        send('done', { success: false, runId, message: hintMsg, missing });
        return;
      }

      for (const name of permsetNames) {
        const args = ['org', 'assign', 'permset', '--name', name, '--target-org', routerState.selectedOrgAlias];
        if (targetUser) args.push('--on-behalf-of', targetUser);
        logger.log(runId, { level: 'info', step: 'permset', action: 'sf-exec', message: `sf ${args.join(' ')}` });
        const { exitCode } = await runCommand({
          command: 'sf',
          args,
          onLine: (line, stream) => {
            logger.log(runId, { level: stream === 'stderr' ? 'error' : 'info', step: 'permset', action: 'sf-exec', message: line });
            const hint = matchHint(line);
            if (hint) logger.log(runId, { level: 'hint', step: 'permset', action: 'hint', message: hint });
          },
        });
        results.push({ name, exitCode });
      }
      const allOk = results.every((r) => r.exitCode === 0);
      send('done', { success: allOk, runId, results });
    } catch (err) {
      send('done', { success: false, runId, message: err.message });
    } finally {
      unsubscribe();
      await logger.close(runId);
      res.end();
    }
  });

  router.get('/setup/ngrok/status', (req, res) => {
    const running = registry.list().some((p) => p.name === 'ngrok');
    if (!running) {
      routerState.ngrok = null;
      return res.json({ running: false });
    }
    res.json({ running: true, ...(routerState.ngrok || {}) });
  });

  router.post('/setup/ngrok/start', async (req, res) => {
    const { port = 3030 } = req.body || {};
    if (typeof port !== 'number' || port < 1 || port > 65535) {
      return res.status(400).json({ error: true, code: 'INVALID_PORT', message: 'port must be 1-65535' });
    }

    // Idempotent: if a tunnel is already registered and we have its URL,
    // return that instead of spawning a second ngrok. Prevents duplicate
    // tunnels when the user revisits Step 4.
    const alreadyRunning = registry.list().some((p) => p.name === 'ngrok');
    if (alreadyRunning && routerState.ngrok?.url) {
      return res.json({ ...routerState.ngrok, reused: true });
    }

    const { randomUUID } = await import('node:crypto');
    const { startNgrok } = await import('../setup/ngrokRunner.js');
    const runId = randomUUID();
    // Logger stays open for ngrok's lifetime (child keeps writing to stdout).
    // It is closed by /setup/ngrok/stop or /setup/complete cleanup.
    logger.open(runId);
    routerState.lastRunIds.ngrok = runId;
    try {
      const { url, pid } = await startNgrok({ port, registry, logger, runId });
      routerState.ngrok = { url, pid, runId };
      res.json({ url, pid, runId });
    } catch (err) {
      await logger.close(runId);
      routerState.ngrok = null;
      res.status(500).json({ error: true, code: 'NGROK_FAILED', message: err.message, runId });
    }
  });

  router.post('/setup/ngrok/stop', async (req, res) => {
    const stopped = await registry.stop('ngrok');
    const runId = routerState.lastRunIds.ngrok;
    if (runId) {
      await logger.close(runId);
      routerState.lastRunIds.ngrok = null;
    }
    routerState.ngrok = null;
    res.json({ stopped });
  });

  router.get('/setup/processes', (req, res) => {
    res.json({ processes: registry.list() });
  });

  router.post('/setup/processes/stop-all', async (req, res) => {
    await registry.stopAll();
    res.json({ stopped: true });
  });

  router.get('/setup/logs/:runId', (req, res) => {
    const { runId } = req.params;
    if (!/^[A-Za-z0-9-]+$/.test(runId)) {
      return res.status(400).json({ error: true, code: 'INVALID_RUN_ID' });
    }
    const file = `logs/setup-${runId}.log`;
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: true, code: 'NOT_FOUND' });
    }
    res.type('text/plain').send(fs.readFileSync(file, 'utf-8'));
  });

  return { router, logger, registry };
}
