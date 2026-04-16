import { Router } from 'express';

export function createHealthRouter(scrt2Client) {
  const router = Router();
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      configured: scrt2Client.isConfigured(),
      scrtBaseUrl: scrt2Client.scrtBaseUrl ? '***configured***' : null,
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
