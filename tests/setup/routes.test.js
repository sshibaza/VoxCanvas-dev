import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { createSetupRouter } from '../../src/server/routes/setup.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  const dummyClient = { configure: () => {} };
  const { router } = createSetupRouter(dummyClient);
  app.use('/api', router);
  return app;
}

// Creates a temporary bin/ dir containing a fake `sf` script whose stdout
// is controlled by this test. Lets us drive the real runSfJson pipeline
// (execFileSync + stripAnsi + JSON.parse) without a real sf install —
// catching things like missing imports, bad env passthrough, or regex
// regressions that unit tests alone don't exercise.
function withFakeSf(stdout) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-sf-'));
  const script = path.join(dir, 'sf');
  // The script just prints the fixture as-is (ANSI escapes included).
  // printf %b expands \x escapes; we base64 the fixture to avoid shell
  // quoting surprises when the fixture contains quotes or backslashes.
  const b64 = Buffer.from(stdout, 'utf-8').toString('base64');
  fs.writeFileSync(script, `#!/bin/sh\necho '${b64}' | base64 -d\n`, { mode: 0o755 });
  const prevPath = process.env.PATH;
  process.env.PATH = `${dir}:${prevPath}`;
  return () => {
    process.env.PATH = prevPath;
    fs.rmSync(dir, { recursive: true });
  };
}

describe('GET /api/setup/status', () => {
  test('returns expected fields', async () => {
    const res = await request(makeApp()).get('/api/setup/status');
    assert.equal(res.status, 200);
    assert.ok('hasEnv' in res.body);
    assert.ok('hasCerts' in res.body);
    assert.ok('sfCliVersion' in res.body);
    assert.ok('ngrokVersion' in res.body);
    assert.ok('opensslAvailable' in res.body);
  });
});

describe('localhostOnly', () => {
  test('rejects non-loopback IPs', async () => {
    const app = makeApp();
    app.set('trust proxy', true);
    const res = await request(app)
      .get('/api/setup/status')
      .set('X-Forwarded-For', '10.0.0.1');
    assert.equal(res.status, 403);
  });
});

describe('POST /api/setup/org/select', () => {
  test('rejects invalid alias', async () => {
    const res = await request(makeApp())
      .post('/api/setup/org/select')
      .send({ alias: 'bad; rm -rf /' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_ALIAS');
  });
});

describe('POST /api/setup/org/select end-to-end with fake sf', () => {
  test('parses ANSI-coloured JSON successfully', async () => {
    const fixture = `\x1b[97m{\x1b[39m"status":0,"result":{"id":"00Dxx","username":"u@example.com","instanceUrl":"https://example.my.salesforce.com"}\x1b[97m}\x1b[39m`;
    const cleanup = withFakeSf(fixture);
    try {
      const res = await request(makeApp())
        .post('/api/setup/org/select')
        .send({ alias: 'myorg' });
      assert.equal(res.status, 200, `expected 200, got ${res.status} body=${JSON.stringify(res.body)}`);
      assert.equal(res.body.alias, 'myorg');
      assert.equal(res.body.username, 'u@example.com');
      assert.equal(res.body.scrtBaseUrl, 'https://example.my.salesforce-scrt.com');
    } finally {
      cleanup();
    }
  });

  test('recovers via body-extraction when banner prefixes JSON', async () => {
    const fixture = `› Warning: @salesforce/cli update available from 2.124.7 to 2.130.9.\n{"status":0,"result":{"id":"00Dyy","username":"b@example.com","instanceUrl":"https://b.my.salesforce.com"}}`;
    const cleanup = withFakeSf(fixture);
    try {
      const res = await request(makeApp())
        .post('/api/setup/org/select')
        .send({ alias: 'banner' });
      assert.equal(res.status, 200);
      assert.equal(res.body.username, 'b@example.com');
    } finally {
      cleanup();
    }
  });

  test('returns wrapped [VoxCanvas] error for truly unparseable output', async () => {
    const fixture = 'total garbage no braces here';
    const cleanup = withFakeSf(fixture);
    try {
      const res = await request(makeApp())
        .post('/api/setup/org/select')
        .send({ alias: 'junk' });
      assert.equal(res.status, 500);
      assert.equal(res.body.code, 'SF_DISPLAY_FAILED');
      assert.match(res.body.message, /\[VoxCanvas /);
    } finally {
      cleanup();
    }
  });
});

describe('POST /api/setup/cc/deploy validation', () => {
  test('rejects non-https endpoint', async () => {
    const res = await request(makeApp())
      .post('/api/setup/cc/deploy')
      .send({ serviceEndpoint: 'http://insecure.example', developerName: 'Good', masterLabel: 'Good' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_ENDPOINT');
  });

  test('rejects bad developerName', async () => {
    const res = await request(makeApp())
      .post('/api/setup/cc/deploy')
      .send({ serviceEndpoint: 'https://a.b', developerName: 'bad name', masterLabel: 'L' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_NAME');
  });
});
