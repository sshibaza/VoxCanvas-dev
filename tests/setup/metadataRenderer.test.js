import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

  test('renders vendor + Apex stub in SFDX source format (no CallCenter — Partner Telephony CCs are not MDAPI-deployable)', () => {
    const result = renderMetadata({
      templatesDir,
      values: { SERVICE_ENDPOINT: 'https://abc.ngrok.io' },
    });

    const projectFile = path.join(result.tmpDir, 'sfdx-project.json');
    const srcRoot = path.join(result.tmpDir, 'force-app', 'main', 'default');
    const vendorFile = path.join(srcRoot, 'ConversationVendorInformation', 'VoxCanvas.ConversationVendorInformation-meta.xml');
    const classFile = path.join(srcRoot, 'classes', 'VoxCanvasTelephonyIntegration.cls');
    const classMeta = path.join(srcRoot, 'classes', 'VoxCanvasTelephonyIntegration.cls-meta.xml');
    const ccDir = path.join(srcRoot, 'callCenters');
    const strayPkg = path.join(result.tmpDir, 'package.xml');

    assert.ok(fs.existsSync(projectFile), 'sfdx-project.json must exist so sf CLI recognises the workspace');
    assert.ok(fs.existsSync(vendorFile), 'vendor XML must be under force-app/main/default/ConversationVendorInformation');
    assert.ok(fs.existsSync(classFile), 'Apex stub .cls must be copied — ServiceCloudVoicePartner requires integrationClass');
    assert.ok(fs.existsSync(classMeta), 'Apex stub .cls-meta.xml must be copied for it to deploy');
    // Regression guard: the callCenters/ directory must NOT be part of
    // the deploy payload. Partner Telephony CallCenters cannot be
    // provisioned through the Metadata API CallCenter type (its schema
    // is locked to classic CTI fields — reqVersion / reqDescription /
    // reqProgId / etc. — and rejects Partner Telephony fields). The
    // Contact Center is created via Setup UI Import of a generated
    // XML (see src/server/setup/ccImportXml.js).
    assert.ok(!fs.existsSync(ccDir), 'callCenters/ must NOT be in the deploy payload — Partner Telephony CCs are Setup-UI Import only');
    assert.ok(!fs.existsSync(strayPkg), 'No hand-authored package.xml — sf CLI generates it from the source tree');
    assert.equal(result.sourceDir, 'force-app');

    const vendor = fs.readFileSync(vendorFile, 'utf-8');
    assert.match(vendor, /<integrationClass>VoxCanvasTelephonyIntegration<\/integrationClass>/);
    assert.match(vendor, /https:\/\/abc\.ngrok\.io/);
    assert.ok(!vendor.includes('{{SERVICE_ENDPOINT}}'));
    assert.match(vendor, /<connectorUrl>/);
    assert.match(vendor, /<vendorType>ServiceCloudVoicePartner<\/vendorType>/);
    // Every *Supported flag that requires an <integrationClass>
    // implementation (Apex KeyProvider / ConversationInsights / etc.)
    // must be explicitly false. VoxCanvas ships only an empty stub.
    const apexRequiringFlags = [
      'keyProvisioningSupported',
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
