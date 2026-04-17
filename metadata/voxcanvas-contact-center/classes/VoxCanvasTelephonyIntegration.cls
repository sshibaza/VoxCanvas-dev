public with sharing class VoxCanvasTelephonyIntegration {
    // Stub required by ServiceCloudVoicePartner vendor metadata — the
    // platform validator refuses to deploy a Partner Telephony vendor
    // without an <integrationClass>, even when every *Supported flag
    // is set to false.
    //
    // VoxCanvas is an HTTP/REST-only connector. Every callback-driven
    // feature (einsteinConversationInsightsSupported, userSyncingSupported,
    // partnerTransferDestinationsSupported, partnerContactCenterListSupported,
    // agentSSOSupported) is explicitly disabled in the vendor XML, so
    // no method of this class is ever invoked at runtime. It exists
    // solely to satisfy platform validation.
    //
    // Uses `public with sharing` (not `global`) because the class is
    // never called across namespaces, and `with sharing` is the secure
    // default even for an empty body.
}
