import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { renderMetadata, escapeXml, encodePem } from '../../src/server/setup/metadataRenderer.js';

describe('escapeXml', () => {
  test('escapes &, <, >, ", \'', () => {
    assert.equal(escapeXml('a & b < c > d " e \' f'), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });

  test('leaves plain text unchanged', () => {
    assert.equal(escapeXml('hello-world_1'), 'hello-world_1');
  });
});

describe('encodePem', () => {
  test('converts newlines to &#10;', () => {
    const pem = '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----\n';
    const encoded = encodePem(pem);
    assert.ok(!encoded.includes('\n'));
    assert.match(encoded, /&#10;/);
  });
});

describe('renderMetadata', () => {
  const templatesDir = path.resolve('metadata/voxcanvas-contact-center');

  test('renders ConversationVendorInfo-only MDAPI layout (ContactCenter is REST-created separately)', () => {
    const result = renderMetadata({
      templatesDir,
      values: { SERVICE_ENDPOINT: 'https://abc.ngrok.io' },
    });

    const projectFile = path.join(result.tmpDir, 'sfdx-project.json');
    const mdRoot = path.join(result.tmpDir, 'metadata');
    const pkgFile = path.join(mdRoot, 'package.xml');
    const vendorFile = path.join(mdRoot, 'conversationVendorInfos', 'VoxCanvas.conversationVendorInfo-meta.xml');
    const ccDir = path.join(mdRoot, 'contactCenters');

    assert.ok(fs.existsSync(projectFile), 'sfdx-project.json must exist so sf CLI recognises the workspace');
    assert.ok(fs.existsSync(pkgFile), 'MDAPI package.xml must exist so --metadata-dir can resolve types');
    assert.ok(fs.existsSync(vendorFile));
    assert.ok(!fs.existsSync(ccDir), 'contactCenters/ must NOT exist — CC is not a Metadata API type');
    assert.equal(result.metadataDir, 'metadata');

    const vendor = fs.readFileSync(vendorFile, 'utf-8');
    assert.match(vendor, /https:\/\/abc\.ngrok\.io/);
    assert.ok(!vendor.includes('{{SERVICE_ENDPOINT}}'));

    const pkg = fs.readFileSync(pkgFile, 'utf-8');
    assert.match(pkg, /<name>ConversationVendorInfo<\/name>/);
    assert.ok(!pkg.includes('ContactCenter'), 'package.xml must not reference ContactCenter');

    result.cleanup();
    assert.ok(!fs.existsSync(result.tmpDir));
  });

  test('throws if SERVICE_ENDPOINT placeholder is left unfilled', () => {
    assert.throws(() =>
      renderMetadata({ templatesDir, values: {} }),
      /Unfilled placeholder/);
  });

  test('XML-escapes dangerous characters in serviceEndpoint', () => {
    const result = renderMetadata({
      templatesDir,
      values: { SERVICE_ENDPOINT: 'https://a&b.com' },
    });
    const vendor = fs.readFileSync(
      path.join(result.tmpDir, 'metadata', 'conversationVendorInfos', 'VoxCanvas.conversationVendorInfo-meta.xml'),
      'utf-8',
    );
    assert.match(vendor, /https:\/\/a&amp;b\.com/);
    result.cleanup();
  });
});
