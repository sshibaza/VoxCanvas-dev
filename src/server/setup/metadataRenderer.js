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

// Copy every .xml under templatesDir to a self-contained SFDX SOURCE
// project layout rooted at dstRoot:
//
//   dstRoot/
//     sfdx-project.json
//     force-app/main/default/<templateTypeDir>/<file>.xml
//
// We intentionally use SFDX source format (NOT MDAPI) because:
//   1. sf CLI's source-deploy-retrieve registry knows the canonical
//      source-format directory/file convention for
//      ConversationVendorInformation and correctly translates it to
//      the MDAPI type name `ConversationVendorInfo` on the wire.
//   2. If we hand-author MDAPI, we have to guess the lower-case plural
//      folder ("conversationVendorInfos"? "conversationVendorInfo"?)
//      and the org rejects mismatches with opaque errors. The registry
//      already has the right answer — let sf CLI apply it.
//   3. No package.xml is needed — sf CLI generates it on the fly.
//
// ConversationVendorInformation (source-format folder name) IS in the
// registry. ContactCenter is NOT, which is why the CC record is
// created separately via the ContactCenter sObject REST API instead of
// through Metadata API.
function copyAndRender(srcDir, dstRoot, values) {
  fs.mkdirSync(dstRoot, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      copyAndRender(path.join(srcDir, entry.name), path.join(dstRoot, entry.name), values);
    } else if (entry.name.endsWith('.xml')) {
      const src = path.join(srcDir, entry.name);
      const dst = path.join(dstRoot, entry.name);
      fs.writeFileSync(dst, substitute(fs.readFileSync(src, 'utf-8'), values));
    }
  }
}

const SFDX_PROJECT_JSON = JSON.stringify({
  packageDirectories: [{ path: 'force-app', default: true }],
  sourceApiVersion: '63.0',
}, null, 2) + '\n';

export function renderMetadata({ templatesDir, values }) {
  const encodedValues = {};
  for (const [key, raw] of Object.entries(values)) {
    encodedValues[key] = key === 'PUBLIC_KEY_PEM' ? encodePem(raw) : escapeXml(raw);
  }
  const tmpDir = path.join(os.tmpdir(), `voxcanvas-meta-${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'sfdx-project.json'), SFDX_PROJECT_JSON);
  const sourceRoot = path.join(tmpDir, 'force-app', 'main', 'default');
  fs.mkdirSync(sourceRoot, { recursive: true });
  copyAndRender(templatesDir, sourceRoot, encodedValues);
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
