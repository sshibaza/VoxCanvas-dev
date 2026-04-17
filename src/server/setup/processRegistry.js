export class ProcessRegistry {
  constructor() {
    this.entries = new Map();
  }

  register(name, child, { label } = {}) {
    this.entries.set(name, {
      name,
      pid: child.pid,
      child,
      label: label || name,
      startedAt: new Date().toISOString(),
    });
    child.once('exit', () => {
      this.entries.delete(name);
    });
  }

  list() {
    return [...this.entries.values()].map(({ child, ...rest }) => rest);
  }

  async stop(name, { timeoutMs = 3000 } = {}) {
    const entry = this.entries.get(name);
    if (!entry) return false;
    const { child } = entry;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    await exited;
    clearTimeout(timer);
    this.entries.delete(name);
    return true;
  }

  async stopAll() {
    const names = [...this.entries.keys()];
    await Promise.all(names.map((n) => this.stop(n)));
  }
}

export const defaultRegistry = new ProcessRegistry();
