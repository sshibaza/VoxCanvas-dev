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

// Copy every XML file from templatesDir into dstRoot preserving the
// MDAPI layout expected by `sf project deploy start --metadata-dir`:
//
//   dstRoot/
//     package.xml
//     <metadataType>/<rendered-filename>.xml
//
// ContactCenter is not in the sf CLI source-deploy-retrieve registry
// yet (sf 2.124+), so SFDX source deploy (--source-dir) fails with
// TypeInferenceError. MDAPI deploy keys off package.xml and bypasses
// filename-based type inference entirely.
function copyAndRender(srcDir, dstRoot, values) {
  fs.mkdirSync(dstRoot, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const renderedName = entry.name.replace(/TEMPLATE/g, values.CC_DEVELOPER_NAME);
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstRoot, renderedName);
    if (entry.isDirectory()) {
      copyAndRender(srcPath, dstPath, values);
    } else if (entry.name.endsWith('.xml')) {
      fs.writeFileSync(dstPath, substitute(fs.readFileSync(srcPath, 'utf-8'), values));
    }
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
  // sfdx-project.json exists only to satisfy sf's workspace check. The
  // actual deploy targets `metadata/` as an MDAPI dir — force-app never
  // gets populated, but referencing it keeps the project JSON valid.
  fs.writeFileSync(path.join(tmpDir, 'sfdx-project.json'), SFDX_PROJECT_JSON);
  const metadataDir = path.join(tmpDir, 'metadata');
  copyAndRender(templatesDir, metadataDir, encodedValues);
  return {
    tmpDir,
    metadataDir: 'metadata',
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
