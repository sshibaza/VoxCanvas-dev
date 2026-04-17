import { spawn } from 'node:child_process';

// Disable ANSI colour output from tools that would otherwise wrap JSON /
// log lines in escape sequences. sf CLI and many others respect these.
const NO_COLOR_ENV = { NO_COLOR: '1', FORCE_COLOR: '0', TERM: 'dumb' };

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(s) {
  return s ? s.replace(ANSI_RE, '') : s;
}

export function runCommand({ command, args = [], env, cwd, onLine, timeoutMs = 180_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      env: { ...process.env, ...NO_COLOR_ENV, ...(env || {}) },
      cwd,
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    function flush(buf, stream) {
      const parts = buf.split(/\r?\n/);
      const tail = parts.pop();
      for (const line of parts) {
        const clean = stripAnsi(line);
        if (clean.length) onLine?.(clean, stream);
      }
      return tail;
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuf = flush(stdoutBuf + chunk.toString('utf-8'), 'stdout');
    });
    child.stderr.on('data', (chunk) => {
      stderrBuf = flush(stderrBuf + chunk.toString('utf-8'), 'stderr');
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const tailOut = stripAnsi(stdoutBuf);
      const tailErr = stripAnsi(stderrBuf);
      if (tailOut) onLine?.(tailOut, 'stdout');
      if (tailErr) onLine?.(tailErr, 'stderr');
      resolve({ exitCode });
    });
  });
}

export async function runSfJson({ args, logger, runId, step }) {
  let jsonOutput = '';
  const { exitCode } = await runCommand({
    command: 'sf',
    args,
    onLine: (line, stream) => {
      if (stream === 'stdout') jsonOutput += line + '\n';
      logger?.log(runId, { level: stream === 'stderr' ? 'error' : 'info', step, action: 'sf-exec', message: line });
    },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(jsonOutput);
  } catch { /* not json */ }
  return { exitCode, json: parsed, raw: jsonOutput };
}
