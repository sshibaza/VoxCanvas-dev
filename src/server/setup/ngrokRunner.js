import { spawn } from 'node:child_process';
import http from 'node:http';

const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';

function fetchTunnels(timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get(NGROK_API, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('ngrok API timeout')));
  });
}

export async function startNgrok({ port = 3030, registry, logger, runId } = {}) {
  const child = spawn('ngrok', ['http', String(port), '--log=stdout'], {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (c) => logger?.log(runId, { level: 'info', step: 'ngrok', action: 'ngrok', message: c.toString().trim() }));
  child.stderr.on('data', (c) => logger?.log(runId, { level: 'error', step: 'ngrok', action: 'ngrok', message: c.toString().trim() }));

  registry?.register('ngrok', child, { label: `ngrok http ${port}` });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const data = await fetchTunnels();
      const tunnel = data?.tunnels?.find((t) => t.proto === 'https');
      if (tunnel?.public_url) {
        return { url: tunnel.public_url, pid: child.pid };
      }
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }

  if (registry) {
    await registry.stop('ngrok');
  } else {
    child.kill('SIGTERM');
  }
  throw new Error('ngrok tunnel did not become ready within 10s');
}

export async function stopNgrok({ registry } = {}) {
  return registry?.stop('ngrok');
}
