import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderMetadata, escapeXml, encodePem } from '../../src/server/setup/metadataRenderer.js';

const FULL_VALUES = {
  SERVICE_ENDPOINT: 'https://abc.ngrok.io',
  CC_DEVELOPER_NAME: 'VoxCanvas_CC',
  CC_MASTER_LABEL: 'VoxCanvas Contact Center',
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

  test('renders SFDX source-format layout with vendor, Apex stub, and CallCenter', () => {
    const result = renderMetadata({ templatesDir, values: FULL_VALUES });

    const projectFile = path.join(result.tmpDir, 'sfdx-project.json');
    const srcRoot = path.join(result.tmpDir, 'force-app', 'main', 'default');
    const vendorFile = path.join(srcRoot, 'ConversationVendorInformation', 'VoxCanvas.ConversationVendorInformation-meta.xml');
    const classFile = path.join(srcRoot, 'classes', 'VoxCanvasTelephonyIntegration.cls');
    const classMeta = path.join(srcRoot, 'classes', 'VoxCanvasTelephonyIntegration.cls-meta.xml');
    const callCenterFile = path.join(srcRoot, 'callCenters', `${FULL_VALUES.CC_DEVELOPER_NAME}.callCenter-meta.xml`);
    const strayPkg = path.join(result.tmpDir, 'package.xml');

    assert.ok(fs.existsSync(projectFile), 'sfdx-project.json must exist so sf CLI recognises the workspace');
    assert.ok(fs.existsSync(vendorFile), 'vendor XML must be under force-app/main/default/ConversationVendorInformation');
    assert.ok(fs.existsSync(classFile), 'Apex stub .cls must be copied — ServiceCloudVoicePartner requires integrationClass');
    assert.ok(fs.existsSync(classMeta), 'Apex stub .cls-meta.xml must be copied for it to deploy');
    assert.ok(fs.existsSync(callCenterFile), `callCenter XML must be renamed to ${FULL_VALUES.CC_DEVELOPER_NAME}.callCenter-meta.xml (sf CLI source-format requires the filename to match the InternalName)`);
    assert.ok(!fs.existsSync(strayPkg), 'No hand-authored package.xml — sf CLI generates it from the source tree');
    assert.equal(result.sourceDir, 'force-app');

    // integrationClass must be wired into the vendor XML so the stub
    // is not orphaned at deploy time.
    const vendor = fs.readFileSync(vendorFile, 'utf-8');
    assert.match(vendor, /<integrationClass>VoxCanvasTelephonyIntegration<\/integrationClass>/);

    assert.match(vendor, /https:\/\/abc\.ngrok\.io/);
    assert.ok(!vendor.includes('{{SERVICE_ENDPOINT}}'));
    // Regression guards: the old (wrong) field names must not reappear.
    assert.ok(!vendor.includes('serviceEndpoint'), 'serviceEndpoint is not a real field; use connectorUrl');
    assert.ok(!vendor.includes('conversationVendorType'), 'conversationVendorType is not a real field; use vendorType');
    assert.match(vendor, /<connectorUrl>/);
    assert.match(vendor, /<vendorType>ServiceCloudVoicePartner<\/vendorType>/);
    // Every *Supported flag that requires an <integrationClass> (Apex
    // KeyProvider / ConversationInsights / etc. implementation) must be
    // explicitly false. VoxCanvas ships only an empty stub.
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

    const cc = fs.readFileSync(callCenterFile, 'utf-8');
    // CallCenter XML MUST be <callCenter> (lowercase c) — the sf CLI
    // source-deploy-retrieve registry and the Metadata API type name is
    // CallCenter but the XML root follows the sample at
    // github.com/service-cloud-voice/examples-from-doc, which uses
    // <callCenter>. Getting this wrong would surface as a silent
    // deploy-nothing-and-no-error.
    assert.match(cc, /<callCenter[ >]/);
    // CRITICAL regression guard: CallCenter uses a legacy XML schema
    // that does NOT use the http://soap.sforce.com/2006/04/metadata
    // namespace. An xmlns attribute causes the Metadata API validator
    // to reject <section> with "invalid at this location in type
    // CallCenter". This test locks in the no-namespace fix shipped in
    // wizard-cc-19 after a live deploy failure.
    assert.ok(!cc.includes('xmlns='),
      'CallCenter XML must NOT have an xmlns attribute (unlike most Metadata API types, the CallCenter schema is no-namespace; deploying with xmlns="http://soap.sforce.com/2006/04/metadata" makes the validator reject <section>)');
    assert.match(cc, /<item sortOrder="0" name="reqInternalName"[^>]*>VoxCanvas_CC<\/item>/);
    assert.match(cc, /<item sortOrder="1" name="reqDisplayName"[^>]*>VoxCanvas Contact Center<\/item>/);
    // reqVendorInfoApiName MUST equal the ConversationVendorInfo
    // developerName (VoxCanvas) or the deploy will fail with an
    // unresolved-reference validator error.
    assert.match(cc, /<item sortOrder="2" name="reqVendorInfoApiName"[^>]*>VoxCanvas<\/item>/);
    // JWT public key is injected directly into reqTelephonyIntegrationCertificate
    // so the admin does not have to paste it manually via Setup UI.
    assert.match(cc, /-----BEGIN PUBLIC KEY-----/);
    assert.match(cc, /-----END PUBLIC KEY-----/);
    // Required fields VoxCanvas does not use (SSO) must still be
    // present (as empty items) so the validator does not reject the
    // deploy for missing required req* items.
    assert.match(cc, /name="reqRelayState"/);
    assert.match(cc, /name="reqIdentityUrl"/);
    assert.ok(!cc.includes('{{'), 'no unfilled {{PLACEHOLDER}} markers should remain in rendered CallCenter XML');

    result.cleanup();
    assert.ok(!fs.existsSync(result.tmpDir));
  });

  test('throws if any placeholder is left unfilled', () => {
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

  test('filename substitution does NOT XML-escape the CC_DEVELOPER_NAME', () => {
    // Regression guard: if filename substitution accidentally used the
    // encoded (XML-escaped) value dict, names containing & / < would
    // produce files like "foo&amp;bar.callCenter-meta.xml" which sf CLI
    // would reject. Our backend regex only allows [A-Za-z0-9_] so this
    // is a belt-and-suspenders check.
    const result = renderMetadata({
      templatesDir,
      values: { ...FULL_VALUES, CC_DEVELOPER_NAME: 'Custom_Name_123' },
    });
    const ccFile = path.join(result.tmpDir, 'force-app', 'main', 'default', 'callCenters', 'Custom_Name_123.callCenter-meta.xml');
    assert.ok(fs.existsSync(ccFile));
    result.cleanup();
  });
});
