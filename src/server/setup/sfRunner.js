import { spawn } from 'node:child_process';

export function runCommand({ command, args = [], env, cwd, onLine, timeoutMs = 180_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      env: env ? { ...process.env, ...env } : process.env,
      cwd,
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    function flush(buf, stream) {
      const parts = buf.split(/\r?\n/);
      const tail = parts.pop();
      for (const line of parts) {
        if (line.length) onLine?.(line, stream);
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
      if (stdoutBuf) onLine?.(stdoutBuf, 'stdout');
      if (stderrBuf) onLine?.(stderrBuf, 'stderr');
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
