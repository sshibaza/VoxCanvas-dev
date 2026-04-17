import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../../src/server/setup/sfRunner.js';

describe('runCommand', () => {
  test('captures stdout of a successful command', async () => {
    const lines = [];
    const result = await runCommand({
      command: 'node',
      args: ['-e', 'console.log("hello"); console.log("world");'],
      onLine: (line, stream) => lines.push({ line, stream }),
    });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(lines.map((l) => l.line), ['hello', 'world']);
    assert.deepEqual(lines.map((l) => l.stream), ['stdout', 'stdout']);
  });

  test('captures stderr separately', async () => {
    const lines = [];
    await runCommand({
      command: 'node',
      args: ['-e', 'console.error("err-line")'],
      onLine: (line, stream) => lines.push({ line, stream }),
    });
    assert.deepEqual(lines, [{ line: 'err-line', stream: 'stderr' }]);
  });

  test('returns non-zero exitCode on failure', async () => {
    const result = await runCommand({
      command: 'node',
      args: ['-e', 'process.exit(7)'],
      onLine: () => {},
    });
    assert.equal(result.exitCode, 7);
  });

  test('uses shell: false — does not expand shell metachars', async () => {
    const lines = [];
    await runCommand({
      command: 'node',
      args: ['-e', 'console.log(process.argv[1])', '$HOME'],
      onLine: (line) => lines.push(line),
    });
    assert.equal(lines[0], '$HOME');
  });
});
