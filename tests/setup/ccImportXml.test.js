import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderCallCenterImportXml } from '../../src/server/setup/ccImportXml.js';

const FIXTURE_PEM = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...AQAB\n-----END PUBLIC KEY-----\n';

describe('renderCallCenterImportXml', () => {
  test('renders the Setup-UI Import format with all Partner Telephony fields', () => {
    const xml = renderCallCenterImportXml({
      developerName: 'VoxCanvas_CC',
      masterLabel: 'VoxCanvas Contact Center',
      vendorDeveloperName: 'VoxCanvas',
      jwtPem: FIXTURE_PEM,
    });

    // Import format, NOT Metadata API format: root is <callCenter>
    // lowercase, no xmlns. This is what Setup UI Import expects.
    assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<callCenter>/);
    assert.ok(!xml.includes('<CallCenter '), 'must NOT emit Metadata-API-format root <CallCenter ...>');
    assert.ok(!xml.includes('xmlns='), 'must NOT emit xmlns — Setup UI Import format is no-namespace');

    // Attribute-based <section> / <item> — the Import XML shape.
    assert.match(xml, /<section sortOrder="0" name="reqGeneralInfo"[^>]*>/);
    assert.match(xml, /<section sortOrder="1" name="reqHvcc"[^>]*>/);

    // Partner Telephony fields resolve correctly.
    assert.match(xml, /<item [^>]*name="reqInternalName"[^>]*>VoxCanvas_CC<\/item>/);
    assert.match(xml, /<item [^>]*name="reqDisplayName"[^>]*>VoxCanvas Contact Center<\/item>/);
    assert.match(xml, /<item [^>]*name="reqVendorInfoApiName"[^>]*>VoxCanvas<\/item>/);
    // PEM embedded so the admin does not have to paste the public key manually.
    assert.match(xml, /<item [^>]*name="reqTelephonyIntegrationCertificate"[^>]*>[\s\S]*?-----BEGIN PUBLIC KEY-----[\s\S]*?<\/item>/);
  });

  test('XML-escapes malicious-looking input in masterLabel', () => {
    const xml = renderCallCenterImportXml({
      developerName: 'CC1',
      masterLabel: 'Bobby <Tables>&co',
      vendorDeveloperName: 'VoxCanvas',
      jwtPem: FIXTURE_PEM,
    });
    assert.match(xml, /Bobby &lt;Tables&gt;&amp;co/);
    assert.ok(!xml.includes('<Tables>'), 'must escape < in user input so the XML stays well-formed');
  });

  test('namespaced vendor (e.g. managed package) flows through verbatim', () => {
    // If the admin selects a vendor with a namespace prefix from the
    // /setup/cc/vendors list, the API name we emit is
    // `ns__DeveloperName` — the same value Setup UI Import expects.
    const xml = renderCallCenterImportXml({
      developerName: 'CC1',
      masterLabel: 'L',
      vendorDeveloperName: 'byoscv__VoxCanvas_Partner_Telephony',
      jwtPem: FIXTURE_PEM,
    });
    assert.match(xml, /<item [^>]*name="reqVendorInfoApiName"[^>]*>byoscv__VoxCanvas_Partner_Telephony<\/item>/);
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
