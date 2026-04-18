// Setup UI "Import Contact Center" XML generator.
//
// Salesforce has TWO different XML formats for Contact Centers:
//
//   1. Metadata API CallCenter format  — <CallCenter xmlns=...>, capital C,
//      <sections>/<items> with nested <name>/<label>/<value> children.
//      Deployable via `sf project deploy start`, but the schema is locked
//      to classic CTI fields (reqVersion, reqDescription, reqProgId,
//      reqAdapterUrl, etc.) and does NOT accept Partner Telephony fields
//      (reqInternalName, reqVendorInfoApiName, ...). Confirmed by a live
//      deploy that failed validator with "セクション「reqGeneralInfo」には、
//      「reqVersion, reqDescription, reqProgId」という名前のアイテムが必要です。"
//
//   2. Setup UI Import format  — <callCenter> lowercase, no xmlns,
//      <section sortOrder="..." name="..." label="..."> with attributes.
//      Accepted by Setup → Service Cloud Voice → Contact Centers → Import,
//      which is the ONLY supported path for provisioning a Partner Telephony
//      Contact Center with all its settings (vendor reference + JWT public
//      key) in one go. This file generates that format so the admin can
//      click Import and pick the downloaded file.
//
// Authoritative reference for the Import format and field names:
// github.com/service-cloud-voice/examples-from-doc/blob/main/callcenter/partner_telephony_cc_import.xml

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Render the Import XML for a Partner Telephony Contact Center that points
// at the given ConversationVendorInfo (vendorDeveloperName) and embeds the
// given JWT public key into reqTelephonyIntegrationCertificate.
export function renderCallCenterImportXml({
  developerName,
  masterLabel,
  vendorDeveloperName,
  jwtPem,
}) {
  if (!developerName) throw new Error('developerName is required');
  if (!masterLabel) throw new Error('masterLabel is required');
  if (!vendorDeveloperName) throw new Error('vendorDeveloperName is required');
  if (!jwtPem) throw new Error('jwtPem is required');

  const dName = escapeXml(developerName);
  const label = escapeXml(masterLabel);
  const vendor = escapeXml(vendorDeveloperName);
  const pem = escapeXml(jwtPem);

  return `<?xml version="1.0" encoding="UTF-8"?>
<callCenter>
    <section sortOrder="0" name="reqGeneralInfo" label="General Information">
        <item sortOrder="0" name="reqInternalName" label="InternalName">${dName}</item>
        <item sortOrder="1" name="reqDisplayName" label="Display Name">${label}</item>
        <item sortOrder="2" name="reqVendorInfoApiName" label="Conversation Vendor Info Developer Name">${vendor}</item>
    </section>
    <section sortOrder="1" name="reqHvcc" label="SCV Settings">
        <item sortOrder="0" name="reqTelephonyIntegrationCertificate" label="Telephony Integration Certificate">${pem}</item>
        <item sortOrder="1" name="reqLongDistPrefix" label="Long Distance Prefix">+1</item>
    </section>
</callCenter>
`;
}
