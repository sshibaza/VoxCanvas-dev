import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand, stripAnsi } from '../../src/server/setup/sfRunner.js';

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

  test('strips ANSI colour escapes from output', async () => {
    const lines = [];
    await runCommand({
      command: 'node',
      args: ['-e', 'process.stdout.write("\\u001b[97m{\\u001b[39m}\\n")'],
      onLine: (line) => lines.push(line),
    });
    assert.equal(lines[0], '{}');
  });
});

describe('stripAnsi', () => {
  test('removes foreground color codes', () => {
    assert.equal(stripAnsi('\x1b[97m{\x1b[39m}'), '{}');
  });
  test('removes OSC sequences (ESC ] ... BEL)', () => {
    assert.equal(stripAnsi('\x1b]8;;https://example.com\x07hi\x1b]8;;\x07'), 'hi');
  });
  test('removes bare ESC = / ESC > sequences', () => {
    assert.equal(stripAnsi('\x1b=hello\x1b>'), 'hello');
  });
  test('removes sequences with private-mode params (e.g. ?25h)', () => {
    assert.equal(stripAnsi('\x1b[?25hvisible\x1b[?25l'), 'visible');
  });
  test('leaves plain text unchanged', () => {
    assert.equal(stripAnsi('plain'), 'plain');
  });
  test('handles empty / falsy', () => {
    assert.equal(stripAnsi(''), '');
    assert.equal(stripAnsi(null), null);
  });
});
