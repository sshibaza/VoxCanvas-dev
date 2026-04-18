// Setup UI "Import Contact Center" XML generator.
//
// Salesforce has TWO different XML formats for Contact Centers:
//
//   1. Metadata API CallCenter format  — <CallCenter xmlns=...>, capital C,
//      <sections>/<items> with nested <name>/<label>/<value> children.
//      Deployable via `sf project deploy start` IF customSettings
//      includes "reqCallCenterType":"SCVBYOT" (otherwise the CTI-only
//      schema kicks in). When MDAPI deploy works, no UI Import is
//      needed. In practice this path is unreliable across orgs, so
//      this file exists as the guaranteed-working fallback.
//
//   2. Setup UI Import format  — <callCenter> lowercase, no xmlns,
//      <section sortOrder="..." name="..." label="..."> with attributes.
//      Accepted by Setup → Service Cloud Voice → Contact Centers →
//      Import → (pick Telephony Provider) → upload XML. This is the
//      officially documented path for Partner Telephony Contact Center
//      creation when the customer selects a Telephony Provider in
//      Setup UI — the provider selection triggers an XML upload
//      prompt, and the XML we generate here slots into it.
//
// Reference for the Import format and field names:
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
