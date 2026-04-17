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
//      ConversationVendorInformation and CallCenter, and correctly
//      translates them to MDAPI types `ConversationVendorInfo` and
//      `CallCenter` on the wire.
//   2. If we hand-author MDAPI, we have to guess the lower-case plural
//      folder names and the org rejects mismatches with opaque errors.
//      The registry has the right answer — let sf CLI apply it.
//   3. No package.xml is needed — sf CLI generates it on the fly.
//
// Filenames themselves may contain {{PLACEHOLDER}} markers (e.g.
// `{{CC_DEVELOPER_NAME}}.callCenter-meta.xml`) because the CallCenter
// source-format convention requires the filename to match the
// InternalName. We substitute with the *raw* (non-XML-escaped) values
// for filenames, and *escaped* values for file content.
function copyAndRender(srcDir, dstRoot, rawValues, encodedValues) {
  fs.mkdirSync(dstRoot, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dstName = entry.isDirectory() ? entry.name : substitute(entry.name, rawValues);
    const dst = path.join(dstRoot, dstName);
    if (entry.isDirectory()) {
      copyAndRender(src, dst, rawValues, encodedValues);
    } else if (entry.name.endsWith('.xml')) {
      fs.writeFileSync(dst, substitute(fs.readFileSync(src, 'utf-8'), encodedValues));
    } else {
      // Non-XML files (Apex .cls, static resources, etc.) are copied
      // verbatim — they never contain {{PLACEHOLDER}} markers.
      fs.copyFileSync(src, dst);
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
    // PEM content: the CallCenter item text node preserves literal
    // newlines in the base64 body, so plain XML-escape is sufficient
    // (no need for &#10; encoding which is only required in attribute
    // values). XML-escape is still applied as defense-in-depth in case
    // a future PEM generator inserts `<` / `&` somewhere.
    encodedValues[key] = escapeXml(raw);
  }
  const tmpDir = path.join(os.tmpdir(), `voxcanvas-meta-${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'sfdx-project.json'), SFDX_PROJECT_JSON);
  const sourceRoot = path.join(tmpDir, 'force-app', 'main', 'default');
  fs.mkdirSync(sourceRoot, { recursive: true });
  copyAndRender(templatesDir, sourceRoot, values, encodedValues);
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
