import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderCallCenterImportXml } from '../../src/server/setup/ccImportXml.js';

const FIXTURE_PEM = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...AQAB\n-----END PUBLIC KEY-----\n';

describe('renderCallCenterImportXml', () => {
  test('renders Setup-UI Import format with the "Full API Name" (c__ prefix) vendor reference', () => {
    const xml = renderCallCenterImportXml({
      developerName: 'VoxCanvasDemoCenter',
      masterLabel: 'VoxCanvas Demo Center',
      // The "Full API Name" format — this is what the Setup UI Import
      // validator requires per the official Amazon Connect sample at
      // github.com/service-cloud-voice/examples-from-doc/blob/main/callcenter/amazon_connect_partner_telephony_cc_import.xml
      // which hardcodes `c__AMAZON_CONNECT` with the note "Do not
      // change this value".
      vendorDeveloperName: 'c__VoxCanvas',
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
    // Regression guard for the cc-22 → cc-27 mistake: the value
    // passed in MUST be the Full API Name WITH the c__ prefix.
    // Passing just "VoxCanvas" (without the prefix) is the
    // Salesforce-Import-rejection-trigger that blocked the wizard.
    assert.match(xml, /<item [^>]*name="reqVendorInfoApiName"[^>]*>c__VoxCanvas<\/item>/);
    assert.ok(!/<item [^>]*name="reqVendorInfoApiName"[^>]*>VoxCanvas<\/item>/.test(xml),
      'reqVendorInfoApiName must have the full API Name (c__Prefix) — bare DeveloperName without c__ is rejected by Setup UI Import with the confusing "ベンダー名が一致" error');
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
