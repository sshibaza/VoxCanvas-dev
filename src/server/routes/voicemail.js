import { Router } from 'express';

export function createVoicemailRouter(scrt2Client) {
  const router = Router();
  router.post('/voicemail', async (req, res) => {
    try {
      const { from, to, transcripts, recordingUrl, recordingLength } = req.body;
      if (!from || !to || !transcripts) {
        return res.status(400).json({
          error: true,
          code: 'MISSING_FIELDS',
          message: 'from, to, and transcripts are required.',
        });
      }
      const result = await scrt2Client.sendVoiceMail({
        from, to, transcripts, recordingUrl, recordingLength,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({
        error: true,
        code: 'VOICEMAIL_FAILED',
        message: err.message,
      });
    }
  });
  return router;
}
