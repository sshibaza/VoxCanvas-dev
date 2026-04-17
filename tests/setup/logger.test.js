import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Logger } from '../../src/server/setup/logger.js';

describe('Logger', () => {
  test('formats log line with timestamp, step, level, action, message', () => {
    const logger = new Logger();
    const line = logger.format({
      level: 'info',
      step: 'deploy',
      action: 'sf-exec',
      message: 'sf project deploy start',
    });
    assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[deploy\]\s+INFO\s+sf-exec\s+sf project deploy start$/);
  });

  test('writes to file when runId is opened', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    const logger = new Logger({ logsDir: tmpDir });
    const runId = 'test-run-1';
    logger.open(runId);
    logger.log(runId, { level: 'info', step: 'test', action: 'tick', message: 'hello' });
    await logger.close(runId);
    const content = fs.readFileSync(path.join(tmpDir, `setup-${runId}.log`), 'utf-8');
    assert.match(content, /INFO\s+tick\s+hello/);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('broadcasts log events to SSE subscribers', () => {
    const logger = new Logger();
    const runId = 'test-run-2';
    logger.open(runId);
    const received = [];
    const unsubscribe = logger.subscribe(runId, (event) => received.push(event));
    logger.log(runId, { level: 'warn', step: 's', action: 'a', message: 'm' });
    unsubscribe();
    logger.log(runId, { level: 'info', step: 's', action: 'a', message: 'after unsub' });
    assert.equal(received.length, 1);
    assert.equal(received[0].level, 'warn');
  });

  test('deleteAll() removes all setup-*.log files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-del-'));
    fs.writeFileSync(path.join(tmpDir, 'setup-a.log'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'setup-b.log'), 'y');
    fs.writeFileSync(path.join(tmpDir, 'other.txt'), 'z');
    const logger = new Logger({ logsDir: tmpDir });
    const count = logger.deleteAll();
    assert.equal(count, 2);
    assert.ok(fs.existsSync(path.join(tmpDir, 'other.txt')));
    fs.rmSync(tmpDir, { recursive: true });
  });
});
