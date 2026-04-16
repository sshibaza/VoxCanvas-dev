import { Router } from 'express';

export function createVoiceCallRouter(scrt2Client) {
  const router = Router();

  router.post('/voice-call', async (req, res) => {
    try {
      const { callType, from, to } = req.body;
      if (!callType || !from) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'callType and from are required.',
        });
      }
      const result = await scrt2Client.createVoiceCall({ callType, from, to });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'CREATE_VOICE_CALL_FAILED',
        message: err.message,
      });
    }
  });

  router.patch('/voice-call/:vendorCallKey', async (req, res) => {
    try {
      const { voiceCallId, ...updates } = req.body;
      if (!voiceCallId) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'voiceCallId is required in the request body.',
        });
      }
      const result = await scrt2Client.updateVoiceCall(voiceCallId, updates);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'UPDATE_VOICE_CALL_FAILED',
        message: err.message,
      });
    }
  });

  return router;
}
