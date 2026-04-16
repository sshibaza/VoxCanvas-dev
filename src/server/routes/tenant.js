import { Router } from 'express';

export function createTenantRouter(scrt2Client) {
  const router = Router();
  router.post('/tenant/configure', (req, res) => {
    try {
      const { scrtBaseUrl, orgId, callCenterApiName } = req.body;
      if (!scrtBaseUrl || !orgId || !callCenterApiName) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'scrtBaseUrl, orgId, and callCenterApiName are required.',
        });
      }
      scrt2Client.configure({ scrtBaseUrl, orgId, callCenterApiName });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'CONFIGURE_FAILED',
        message: err.message,
      });
    }
  });
  return router;
}
