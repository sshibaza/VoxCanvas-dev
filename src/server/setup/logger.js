import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LOGS_DIR = 'logs';

export class Logger {
  constructor({ logsDir = DEFAULT_LOGS_DIR } = {}) {
    this.logsDir = logsDir;
    this.streams = new Map(); // runId -> WriteStream
    this.subscribers = new Map(); // runId -> Set<fn>
  }

  format({ level, step, action, message }) {
    const ts = new Date().toISOString();
    const lvl = String(level || 'info').toUpperCase().padEnd(5);
    const stepStr = `[${step || '-'}]`.padEnd(10);
    const actStr = String(action || '-').padEnd(12);
    return `${ts} ${stepStr} ${lvl} ${actStr} ${message}`;
  }

  open(runId) {
    if (this.streams.has(runId)) return;
    if (!fs.existsSync(this.logsDir)) fs.mkdirSync(this.logsDir, { recursive: true });
    const file = path.join(this.logsDir, `setup-${runId}.log`);
    const stream = fs.createWriteStream(file, { flags: 'a' });
    this.streams.set(runId, stream);
    this.subscribers.set(runId, new Set());
  }

  log(runId, event) {
    const line = this.format(event);
    const stream = this.streams.get(runId);
    if (stream) stream.write(line + '\n');
    const subs = this.subscribers.get(runId);
    if (subs) for (const fn of subs) fn({ ...event, line });
  }

  subscribe(runId, fn) {
    const subs = this.subscribers.get(runId);
    if (!subs) return () => {};
    subs.add(fn);
    return () => subs.delete(fn);
  }

  async close(runId) {
    const stream = this.streams.get(runId);
    if (stream) {
      await new Promise((resolve) => stream.end(resolve));
      this.streams.delete(runId);
    }
    this.subscribers.delete(runId);
  }

  deleteAll() {
    if (!fs.existsSync(this.logsDir)) return 0;
    const entries = fs.readdirSync(this.logsDir);
    let count = 0;
    for (const entry of entries) {
      if (entry.startsWith('setup-') && entry.endsWith('.log')) {
        fs.unlinkSync(path.join(this.logsDir, entry));
        count++;
      }
    }
    return count;
  }
}

export const defaultLogger = new Logger();
