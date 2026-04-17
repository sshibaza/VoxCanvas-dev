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

// Walk the template dir and copy XML files into the SFDX source layout at
// dstRoot/force-app/main/default/<type>/<file>. package.xml (MDAPI) is
// skipped — source format does not use it. Non-XML entries are ignored.
function copyAndRender(srcDir, dstRoot, values) {
  const sourceRoot = path.join(dstRoot, 'force-app', 'main', 'default');
  fs.mkdirSync(sourceRoot, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const typeDir = path.join(sourceRoot, entry.name);
      fs.mkdirSync(typeDir, { recursive: true });
      for (const file of fs.readdirSync(path.join(srcDir, entry.name), { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith('.xml')) continue;
        const renderedName = file.name.replace(/TEMPLATE/g, values.CC_DEVELOPER_NAME);
        const src = path.join(srcDir, entry.name, file.name);
        const dst = path.join(typeDir, renderedName);
        fs.writeFileSync(dst, substitute(fs.readFileSync(src, 'utf-8'), values));
      }
    }
    // Top-level files (e.g. package.xml) are intentionally skipped.
  }
}

// Minimal sfdx-project.json so `sf project deploy start` treats the tmp
// directory as a valid workspace. Without this the CLI walks up to the
// user's cwd and fails with InvalidProjectWorkspaceError when VoxCanvas
// itself is not an SFDX project.
const SFDX_PROJECT_JSON = JSON.stringify({
  packageDirectories: [{ path: 'force-app', default: true }],
  sourceApiVersion: '61.0',
}, null, 2) + '\n';

export function renderMetadata({ templatesDir, values }) {
  const encodedValues = {};
  for (const [key, raw] of Object.entries(values)) {
    encodedValues[key] = key === 'PUBLIC_KEY_PEM' ? encodePem(raw) : escapeXml(raw);
  }
  const tmpDir = path.join(os.tmpdir(), `voxcanvas-meta-${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'sfdx-project.json'), SFDX_PROJECT_JSON);
  copyAndRender(templatesDir, tmpDir, encodedValues);
  return {
    tmpDir,
    sourceDir: 'force-app',
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
