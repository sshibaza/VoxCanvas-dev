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

  test('renders SFDX source-format layout (sfdx-project.json + force-app/main/default/<type>/<file>)', () => {
    const result = renderMetadata({
      templatesDir,
      values: { SERVICE_ENDPOINT: 'https://abc.ngrok.io' },
    });

    const projectFile = path.join(result.tmpDir, 'sfdx-project.json');
    const srcRoot = path.join(result.tmpDir, 'force-app', 'main', 'default');
    const vendorFile = path.join(srcRoot, 'ConversationVendorInformation', 'VoxCanvas.ConversationVendorInformation-meta.xml');
    const ccDir = path.join(srcRoot, 'contactCenters');
    const strayPkg = path.join(result.tmpDir, 'package.xml');

    assert.ok(fs.existsSync(projectFile), 'sfdx-project.json must exist so sf CLI recognises the workspace');
    assert.ok(fs.existsSync(vendorFile), 'vendor XML must be under force-app/main/default/ConversationVendorInformation');
    assert.ok(!fs.existsSync(ccDir), 'contactCenters/ must NOT exist — CC is not a Metadata API type');
    assert.ok(!fs.existsSync(strayPkg), 'No hand-authored package.xml — sf CLI generates it from the source tree');
    assert.equal(result.sourceDir, 'force-app');

    const vendor = fs.readFileSync(vendorFile, 'utf-8');
    assert.match(vendor, /https:\/\/abc\.ngrok\.io/);
    assert.ok(!vendor.includes('{{SERVICE_ENDPOINT}}'));
    // Regression guards: the old (wrong) field names must not reappear.
    assert.ok(!vendor.includes('serviceEndpoint'), 'serviceEndpoint is not a real field; use connectorUrl');
    assert.ok(!vendor.includes('conversationVendorType'), 'conversationVendorType is not a real field; use vendorType');
    assert.match(vendor, /<connectorUrl>/);
    assert.match(vendor, /<vendorType>ServiceCloudVoicePartner<\/vendorType>/);
    // Regression guard: these *Supported flags require an <integrationClass>
    // (an Apex implementation). VoxCanvas ships no Apex, so every one must
    // be explicitly false — relying on defaults caused the validator to
    // complain "IntegrationClass を指定します" even when these tags were
    // absent from the template.
    const apexRequiringFlags = [
      'einsteinConversationInsightsSupported',
      'userSyncingSupported',
      'partnerTransferDestinationsSupported',
      'partnerContactCenterListSupported',
      'agentSSOSupported',
    ];
    for (const flag of apexRequiringFlags) {
      assert.ok(!new RegExp(`<${flag}>true</${flag}>`).test(vendor),
        `${flag} requires <integrationClass> and must be false`);
      assert.match(vendor, new RegExp(`<${flag}>false</${flag}>`),
        `${flag} must be explicitly set to false so the ServiceCloudVoicePartner defaults don't enable it`);
    }

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
      path.join(result.tmpDir, 'force-app', 'main', 'default', 'ConversationVendorInformation', 'VoxCanvas.ConversationVendorInformation-meta.xml'),
      'utf-8',
    );
    assert.match(vendor, /https:\/\/a&amp;b\.com/);
    result.cleanup();
  });
});
