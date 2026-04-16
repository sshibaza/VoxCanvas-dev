import { Router } from 'express';

export function createHealthRouter(scrt2Client) {
  const router = Router();
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      configured: scrt2Client.isConfigured(),
      missing: {
        scrtBaseUrl: !scrt2Client.scrtBaseUrl,
        orgId: !scrt2Client.orgId,
        callCenterApiName: !scrt2Client.callCenterApiName,
      },
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
