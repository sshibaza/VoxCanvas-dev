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

  test('renders MDAPI layout under metadata/ with sfdx-project.json for workspace recognition', () => {
    const result = renderMetadata({
      templatesDir,
      values: {
        SERVICE_ENDPOINT: 'https://abc.ngrok.io',
        CC_DEVELOPER_NAME: 'VoxCanvas_CC',
        CC_MASTER_LABEL: 'VoxCanvas CC',
        PUBLIC_KEY_PEM: '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----',
      },
    });

    const projectFile = path.join(result.tmpDir, 'sfdx-project.json');
    const mdRoot = path.join(result.tmpDir, 'metadata');
    const pkgFile = path.join(mdRoot, 'package.xml');
    const vendorFile = path.join(mdRoot, 'conversationVendorInfos', 'VoxCanvas.conversationVendorInfo-meta.xml');
    const ccFile = path.join(mdRoot, 'contactCenters', 'VoxCanvas_CC.contactCenter-meta.xml');

    assert.ok(fs.existsSync(projectFile), 'sfdx-project.json must exist so sf CLI recognises the workspace');
    assert.ok(fs.existsSync(pkgFile), 'MDAPI package.xml must exist so --metadata-dir can resolve types');
    assert.ok(fs.existsSync(vendorFile));
    assert.ok(fs.existsSync(ccFile));
    assert.equal(result.metadataDir, 'metadata');

    const vendor = fs.readFileSync(vendorFile, 'utf-8');
    assert.match(vendor, /https:\/\/abc\.ngrok\.io/);
    assert.ok(!vendor.includes('{{SERVICE_ENDPOINT}}'));

    const cc = fs.readFileSync(ccFile, 'utf-8');
    assert.match(cc, /<developerName>VoxCanvas_CC<\/developerName>/);
    assert.match(cc, /&#10;/);

    const pkg = fs.readFileSync(pkgFile, 'utf-8');
    assert.match(pkg, /<members>VoxCanvas_CC<\/members>/);

    result.cleanup();
    assert.ok(!fs.existsSync(result.tmpDir));
  });

  test('throws if a placeholder is left unfilled', () => {
    assert.throws(() =>
      renderMetadata({
        templatesDir,
        values: { SERVICE_ENDPOINT: 'https://abc.ngrok.io' }, // missing others
      }),
    /Unfilled placeholder/);
  });

  test('XML-escapes dangerous characters in values', () => {
    const result = renderMetadata({
      templatesDir,
      values: {
        SERVICE_ENDPOINT: 'https://a&b.com',
        CC_DEVELOPER_NAME: 'Safe_Name',
        CC_MASTER_LABEL: '<not-a-tag>',
        PUBLIC_KEY_PEM: 'KEY',
      },
    });
    const mdRoot = path.join(result.tmpDir, 'metadata');
    const vendor = fs.readFileSync(path.join(mdRoot, 'conversationVendorInfos', 'VoxCanvas.conversationVendorInfo-meta.xml'), 'utf-8');
    const cc = fs.readFileSync(path.join(mdRoot, 'contactCenters', 'Safe_Name.contactCenter-meta.xml'), 'utf-8');
    assert.match(vendor, /https:\/\/a&amp;b\.com/);
    assert.match(cc, /&lt;not-a-tag&gt;/);
    result.cleanup();
  });
});
