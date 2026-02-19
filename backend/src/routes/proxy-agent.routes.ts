import { Router, Response } from 'express';
import { tokenAuthMiddleware } from '../middleware/token-auth';
import { requestLogger } from '../middleware/request-logger';
import { proxyLimiter } from '../middleware/rate-limit';
import { proxyRequest } from '../services/proxy.service';
import { cryptoService } from '../services/crypto.service';
import { TokenAuthenticatedRequest } from '../types';

const router = Router();

/**
 * POST /gw/agent/* → AI Studio proxy
 *
 * Flow: validate token → decrypt agent_api_key → stream proxy.
 * Speed: streaming, no body buffering.
 * Security: agent API key decrypted on-demand, never sent to client.
 */
router.post(
  '/*',
  proxyLimiter,
  tokenAuthMiddleware,
  requestLogger('agent'),
  async (req: TokenAuthenticatedRequest, res: Response) => {
    const conn = req.sapConnection!;

    if (!conn.agent_api_url || !conn.agent_api_key_enc) {
      res.status(400).json({ error: 'Connection has no agent API configuration' });
      return;
    }

    // Build target URL: strip /gw/agent prefix
    const subPath = req.originalUrl.replace(/^\/gw\/agent/, '');
    const targetUrl = `${conn.agent_api_url.replace(/\/$/, '')}${subPath}`;

    try {
      const agentApiKey = await cryptoService.decrypt(conn.agent_api_key_enc);

      await proxyRequest(req, res, targetUrl, {
        'x-api-key': agentApiKey,
      }, 120_000);
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to proxy request to AI Agent' });
      }
    }
  }
);

export default router;
