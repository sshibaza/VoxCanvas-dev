import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderCallCenterImportXml } from '../../src/server/setup/ccImportXml.js';

const FIXTURE_PEM = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...AQAB\n-----END PUBLIC KEY-----\n';

describe('renderCallCenterImportXml', () => {
  test('renders the Setup-UI Import format with all Partner Telephony fields', () => {
    const xml = renderCallCenterImportXml({
      developerName: 'VoxCanvasDemoCenter',
      masterLabel: 'VoxCanvas Demo Center',
      vendorDeveloperName: 'VoxCanvas',
      jwtPem: FIXTURE_PEM,
    });

    // Import format, NOT Metadata API format: root is <callCenter>
    // lowercase, no xmlns.
    assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<callCenter>/);
    assert.ok(!xml.includes('<CallCenter '));
    assert.ok(!xml.includes('xmlns='));

    // Attribute-based <section> / <item> — the Import XML shape.
    assert.match(xml, /<section sortOrder="0" name="reqGeneralInfo"[^>]*>/);
    assert.match(xml, /<section sortOrder="1" name="reqHvcc"[^>]*>/);

    // Partner Telephony fields resolve correctly.
    assert.match(xml, /<item [^>]*name="reqInternalName"[^>]*>VoxCanvasDemoCenter<\/item>/);
    assert.match(xml, /<item [^>]*name="reqDisplayName"[^>]*>VoxCanvas Demo Center<\/item>/);
    assert.match(xml, /<item [^>]*name="reqVendorInfoApiName"[^>]*>VoxCanvas<\/item>/);
    assert.match(xml, /<item [^>]*name="reqTelephonyIntegrationCertificate"[^>]*>[\s\S]*?-----BEGIN PUBLIC KEY-----[\s\S]*?<\/item>/);
  });

  test('namespaced vendor (managed package) passes through verbatim', () => {
    const xml = renderCallCenterImportXml({
      developerName: 'CC1',
      masterLabel: 'L',
      vendorDeveloperName: 'byoscv__VoxCanvas_Partner_Telephony',
      jwtPem: FIXTURE_PEM,
    });
    assert.match(xml, /<item [^>]*name="reqVendorInfoApiName"[^>]*>byoscv__VoxCanvas_Partner_Telephony<\/item>/);
  });

  test('XML-escapes malicious-looking input in masterLabel', () => {
    const xml = renderCallCenterImportXml({
      developerName: 'CC1',
      masterLabel: 'Bobby <Tables>&co',
      vendorDeveloperName: 'VoxCanvas',
      jwtPem: FIXTURE_PEM,
    });
    assert.match(xml, /Bobby &lt;Tables&gt;&amp;co/);
    assert.ok(!xml.includes('<Tables>'));
  });

  test('throws on missing required inputs', () => {
    const base = {
      developerName: 'CC1',
      masterLabel: 'L',
      vendorDeveloperName: 'V',
      jwtPem: FIXTURE_PEM,
    };
    for (const key of Object.keys(base)) {
      assert.throws(() => renderCallCenterImportXml({ ...base, [key]: '' }),
        new RegExp(key, 'i'));
    }
  });
});
