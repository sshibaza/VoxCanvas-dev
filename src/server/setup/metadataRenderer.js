import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function encodePem(pem) {
  return escapeXml(pem).replace(/\r?\n/g, '&#10;');
}

function substitute(text, values) {
  return text.replace(PLACEHOLDER, (_, key) => {
    if (!(key in values)) {
      throw new Error(`Unfilled placeholder: ${key}`);
    }
    return values[key];
  });
}

function copyAndRender(srcDir, dstDir, values) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const renderedName = entry.name.replace(/TEMPLATE/g, values.CC_DEVELOPER_NAME);
    const dstPath = path.join(dstDir, renderedName);
    if (entry.isDirectory()) {
      copyAndRender(srcPath, dstPath, values);
    } else if (entry.name.endsWith('.xml')) {
      const content = fs.readFileSync(srcPath, 'utf-8');
      fs.writeFileSync(dstPath, substitute(content, values));
    }
  }
}

export function renderMetadata({ templatesDir, values }) {
  const encodedValues = {};
  for (const [key, raw] of Object.entries(values)) {
    encodedValues[key] = key === 'PUBLIC_KEY_PEM' ? encodePem(raw) : escapeXml(raw);
  }
  const tmpDir = path.join(os.tmpdir(), `voxcanvas-meta-${randomUUID()}`);
  copyAndRender(templatesDir, tmpDir, encodedValues);
  return {
    tmpDir,
    cleanup() {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

export function cleanupAllTmpDirs() {
  const base = os.tmpdir();
  let count = 0;
  for (const entry of fs.readdirSync(base)) {
    if (entry.startsWith('voxcanvas-meta-')) {
      try {
        fs.rmSync(path.join(base, entry), { recursive: true, force: true });
        count++;
      } catch { /* ignore */ }
    }
  }
  return count;
}
