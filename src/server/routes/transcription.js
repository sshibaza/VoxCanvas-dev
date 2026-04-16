import { Router } from 'express';

export function createTranscriptionRouter(scrt2Client) {
  const router = Router();
  router.post('/voice-call/:vendorCallKey/transcription', async (req, res) => {
    try {
      const { vendorCallKey } = req.params;
      const { content, senderType } = req.body;
      if (!content || !senderType) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'content and senderType are required.',
        });
      }
      const result = await scrt2Client.createTranscription(vendorCallKey, {
        content,
        senderType,
        messageId: req.body.messageId,
        participantId: req.body.participantId,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'TRANSCRIPTION_FAILED',
        message: err.message,
      });
    }
  });
  return router;
}
