import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createSetupRouter } from '../../src/server/routes/setup.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  const dummyClient = { configure: () => {} };
  app.use('/api', createSetupRouter(dummyClient));
  return app;
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
