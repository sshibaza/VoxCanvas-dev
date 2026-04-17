import { Router } from 'express';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../setup/logger.js';
import { ProcessRegistry } from '../setup/processRegistry.js';

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

  router.post('/setup/complete', (req, res) => {
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

      res.json({ success: true, message: 'Configuration saved.' });
    } catch (err) {
      const status = err.code === 'INVALID_INPUT' ? 400 : 500;
      res.status(status).json({
        error: true,
        code: err.code || 'SAVE_FAILED',
        message: err.message,
      });
    }
  });

  router.get('/setup/org', (req, res) => {
    try {
      const defaultOrg = execSync('sf config get target-org --json', { encoding: 'utf-8' });
      const parsed = JSON.parse(defaultOrg);
      const alias = parsed?.result?.[0]?.value || null;
      if (!alias) {
        return res.json({ hasDefault: false });
      }
      const display = JSON.parse(execSync(`sf org display --target-org ${alias} --json`, { encoding: 'utf-8' }));
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
      const out = JSON.parse(execSync('sf org list --json', { encoding: 'utf-8' }));
      const all = [...(out?.result?.nonScratchOrgs || []), ...(out?.result?.scratchOrgs || [])];
      const orgs = all.map((o) => ({
        alias: o.alias,
        username: o.username,
        instanceUrl: o.instanceUrl,
        isDefault: !!o.isDefaultUsername || !!o.isDefaultDevHubUsername,
      }));
      res.json({ orgs });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SF_LIST_FAILED', message: err.message });
    }
  });

  router.post('/setup/org/select', async (req, res) => {
    const { alias } = req.body || {};
    if (!alias || !/^[A-Za-z0-9._-]+$/.test(alias)) {
      return res.status(400).json({ error: true, code: 'INVALID_ALIAS', message: 'alias required (alnum/._-)' });
    }
    try {
      const display = JSON.parse(execSync(`sf org display --target-org ${alias} --json`, { encoding: 'utf-8' }));
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
    if (!alias || !/^[A-Za-z0-9._-]+$/.test(alias)) {
      return res.status(400).json({ error: true, code: 'INVALID_ALIAS', message: 'alias required (alnum/._-)' });
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
      const out = JSON.parse(execSync(
        `sf data query -q "SELECT Id, DeveloperName FROM ContactCenter WHERE DeveloperName = '${name}'" --target-org ${routerState.selectedOrgAlias} --json`,
        { encoding: 'utf-8' },
      ));
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
      logger.log(runId, { level: 'info', step: 'deploy', action: 'prepare', message: `Rendering metadata (endpoint=${serviceEndpoint}, cc=${developerName})` });
      rendered = renderMetadata({
        templatesDir: path.resolve('metadata/voxcanvas-contact-center'),
        values: {
          SERVICE_ENDPOINT: serviceEndpoint,
          CC_DEVELOPER_NAME: developerName,
          CC_MASTER_LABEL: masterLabel,
          PUBLIC_KEY_PEM: pem,
        },
      });
      logger.log(runId, { level: 'info', step: 'deploy', action: 'sf-exec', message: `sf project deploy start --source-dir ${rendered.tmpDir} --target-org ${routerState.selectedOrgAlias}` });
      const { exitCode } = await runCommand({
        command: 'sf',
        args: ['project', 'deploy', 'start', '--source-dir', rendered.tmpDir, '--target-org', routerState.selectedOrgAlias, '--json'],
        onLine: (line, stream) => {
          logger.log(runId, { level: stream === 'stderr' ? 'error' : 'info', step: 'deploy', action: 'sf-exec', message: line });
          const hint = matchHint(line);
          if (hint) logger.log(runId, { level: 'hint', step: 'deploy', action: 'hint', message: hint });
        },
      });
      send('done', { success: exitCode === 0, runId, exitCode, callCenterApiName: developerName });
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

  return router;
}
