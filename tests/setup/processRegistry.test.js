import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { ProcessRegistry } from '../../src/server/setup/processRegistry.js';

describe('ProcessRegistry', () => {
  test('registers a child process and lists it', () => {
    const reg = new ProcessRegistry();
    const child = spawn('node', ['-e', 'setTimeout(()=>{}, 5000)']);
    reg.register('test-proc', child, { label: 'test' });
    const items = reg.list();
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'test-proc');
    assert.equal(items[0].pid, child.pid);
    child.kill();
  });

  test('auto-removes on process exit', async () => {
    const reg = new ProcessRegistry();
    const child = spawn('node', ['-e', 'process.exit(0)']);
    reg.register('short', child);
    await new Promise((resolve) => child.on('exit', resolve));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(reg.list().length, 0);
  });

  test('stop() sends SIGTERM to named process', async () => {
    const reg = new ProcessRegistry();
    const child = spawn('node', ['-e', 'setTimeout(()=>{}, 10000)']);
    reg.register('kill-me', child);
    await reg.stop('kill-me');
    await new Promise((resolve) => child.on('exit', resolve));
    assert.equal(child.killed, true);
  });

  test('stopAll() stops everything registered', async () => {
    const reg = new ProcessRegistry();
    const c1 = spawn('node', ['-e', 'setTimeout(()=>{}, 10000)']);
    const c2 = spawn('node', ['-e', 'setTimeout(()=>{}, 10000)']);
    reg.register('a', c1);
    reg.register('b', c2);
    await reg.stopAll();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(reg.list().length, 0);
  });
});
