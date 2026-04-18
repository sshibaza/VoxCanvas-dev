import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderMetadata, escapeXml, encodePem } from '../../src/server/setup/metadataRenderer.js';

const FULL_VALUES = {
  SERVICE_ENDPOINT: 'https://abc.ngrok.io',
  CC_DEVELOPER_NAME: 'VoxCanvasDemoCenter',
  CC_MASTER_LABEL: 'VoxCanvas Demo Center',
  JWT_PEM: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...AQAB\n-----END PUBLIC KEY-----\n',
};

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

  test('renders vendor + Apex stub + Partner Telephony CallCenter via MDAPI', () => {
    const result = renderMetadata({ templatesDir, values: FULL_VALUES });

    const srcRoot = path.join(result.tmpDir, 'force-app', 'main', 'default');
    const vendorFile = path.join(srcRoot, 'ConversationVendorInformation', 'VoxCanvas.ConversationVendorInformation-meta.xml');
    const classFile = path.join(srcRoot, 'classes', 'VoxCanvasTelephonyIntegration.cls');
    const classMeta = path.join(srcRoot, 'classes', 'VoxCanvasTelephonyIntegration.cls-meta.xml');
    const callCenterFile = path.join(srcRoot, 'callCenters', `${FULL_VALUES.CC_DEVELOPER_NAME}.callCenter-meta.xml`);

    assert.ok(fs.existsSync(vendorFile));
    assert.ok(fs.existsSync(classFile));
    assert.ok(fs.existsSync(classMeta));
    assert.ok(fs.existsSync(callCenterFile), 'callCenter XML must be renamed to match the developerName');
    assert.equal(result.sourceDir, 'force-app');

    // Vendor XML — same assertions as before.
    const vendor = fs.readFileSync(vendorFile, 'utf-8');
    assert.match(vendor, /<integrationClass>VoxCanvasTelephonyIntegration<\/integrationClass>/);
    assert.match(vendor, /<connectorUrl>https:\/\/abc\.ngrok\.io<\/connectorUrl>/);
    assert.match(vendor, /<vendorType>ServiceCloudVoicePartner<\/vendorType>/);
    for (const flag of [
      'keyProvisioningSupported',
      'einsteinConversationInsightsSupported',
      'userSyncingSupported',
      'partnerTransferDestinationsSupported',
      'partnerContactCenterListSupported',
      'agentSSOSupported',
    ]) {
      assert.match(vendor, new RegExp(`<${flag}>false</${flag}>`));
    }

    // CallCenter XML — the MDAPI format that actually deploys for
    // Partner Telephony. Locks in the fix discovered after the failure
    // chain cc-18 → cc-25.
    const cc = fs.readFileSync(callCenterFile, 'utf-8');

    // Root element must be <CallCenter> with standard metadata xmlns —
    // this is the Metadata API format, not the Setup-UI Import format
    // (which would use lowercase <callCenter> with attribute-based
    // <section> elements).
    assert.match(cc, /<CallCenter\s+xmlns="http:\/\/soap\.sforce\.com\/2006\/04\/metadata">/,
      'Root must be <CallCenter> with standard metadata xmlns');
    assert.ok(!/<callCenter[\s>]/.test(cc), 'must not use lowercase <callCenter> root');
    assert.ok(!/<section\s/.test(cc), 'must not use Setup-UI-format <section> with attributes');

    // CRITICAL: reqCallCenterType=SCVBYOT in customSettings. Without
    // this flag the MDAPI validator picks the classic CTI schema and
    // demands reqVersion / reqDescription / reqProgId — the exact
    // error ("セクション「reqGeneralInfo」には、「reqVersion,
    // reqDescription, reqProgId」という名前のアイテムが必要です。")
    // that blocked cc-20. It is also what makes the CC show up on
    // the Partner Telephony Contact Centers Setup page.
    assert.match(cc, /<customSettings>[^<]*"reqCallCenterType":"SCVBYOT"[^<]*<\/customSettings>/,
      'CallCenter customSettings MUST include "reqCallCenterType":"SCVBYOT" — without it the validator demands classic CTI fields');

    // reqVendorInfoApiName must carry the Full API Name — `c__` prefix
    // for an unmanaged/custom vendor (matches the Amazon Connect sample
    // "c__AMAZON_CONNECT" in the official examples-from-doc repo).
    // Missing the c__ prefix produces the Japanese "ベンダー名が一致"
    // error at Setup UI Import time (and probably also breaks the
    // MDAPI CallCenter deploy's reference resolution).
    assert.match(cc, /<items>[\s\S]*?<name>reqVendorInfoApiName<\/name>[\s\S]*?<value>c__VoxCanvas<\/value>[\s\S]*?<\/items>/);
    assert.ok(!/<value>VoxCanvas<\/value>/.test(cc.replace(/c__VoxCanvas/g, '')),
      'reqVendorInfoApiName must be c__VoxCanvas (Full API Name), not bare VoxCanvas');

    // reqInternalName / reqDisplayName values substituted.
    assert.match(cc, /<items>[\s\S]*?<name>reqInternalName<\/name>[\s\S]*?<value>VoxCanvasDemoCenter<\/value>[\s\S]*?<\/items>/);
    assert.match(cc, /<items>[\s\S]*?<name>reqDisplayName<\/name>[\s\S]*?<value>VoxCanvas Demo Center<\/value>[\s\S]*?<\/items>/);

    // JWT PEM injected so the admin does not paste it manually.
    assert.match(cc, /-----BEGIN PUBLIC KEY-----/);
    assert.match(cc, /-----END PUBLIC KEY-----/);
    assert.match(cc, /<name>reqTelephonyIntegrationCertificate<\/name>/);

    // XML comments must not contain "--" — the XML spec forbids it
    // and Salesforce MDAPI rejects it outright. This was the cc-20 bug.
    for (const m of cc.matchAll(/<!--([\s\S]*?)-->/g)) {
      assert.ok(!m[1].includes('--'),
        `CallCenter XML comment contains forbidden "--": ${m[1].slice(0, 100)}`);
    }

    assert.ok(!cc.includes('{{'), 'no unfilled placeholders');

    result.cleanup();
  });

  test('throws if any required placeholder is unfilled', () => {
    assert.throws(() =>
      renderMetadata({ templatesDir, values: { SERVICE_ENDPOINT: 'https://a.b' } }),
      /Unfilled placeholder/);
  });

  test('XML-escapes dangerous characters in serviceEndpoint', () => {
    const result = renderMetadata({
      templatesDir,
      values: { ...FULL_VALUES, SERVICE_ENDPOINT: 'https://a&b.com' },
    });
    const vendor = fs.readFileSync(
      path.join(result.tmpDir, 'force-app', 'main', 'default', 'ConversationVendorInformation', 'VoxCanvas.ConversationVendorInformation-meta.xml'),
      'utf-8',
    );
    assert.match(vendor, /https:\/\/a&amp;b\.com/);
    result.cleanup();
  });

  test('CallCenter filename uses raw (not XML-escaped) CC_DEVELOPER_NAME', () => {
    // Regression guard: if filename substitution accidentally used
    // escaped values, names would produce invalid filenames.
    const result = renderMetadata({
      templatesDir,
      values: { ...FULL_VALUES, CC_DEVELOPER_NAME: 'CustomName123' },
    });
    const ccFile = path.join(result.tmpDir, 'force-app', 'main', 'default', 'callCenters', 'CustomName123.callCenter-meta.xml');
    assert.ok(fs.existsSync(ccFile));
    result.cleanup();
  });
});
