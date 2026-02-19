import { Router, Response } from 'express';
import { tokenAuthMiddleware } from '../middleware/token-auth';
import { requestLogger } from '../middleware/request-logger';
import { proxyLimiter } from '../middleware/rate-limit';
import { proxyRequest } from '../services/proxy.service';
import { sapTokenService } from '../services/sap-token.service';
import { TokenAuthenticatedRequest } from '../types';

const router = Router();

/**
 * ANY /gw/dm/* → SAP DM API proxy
 *
 * Flow: validate token → get SAP bearer → stream proxy → on 401 retry once.
 * Speed: SAP token cached, streaming body, no buffering.
 * Security: gateway token stripped, SAP bearer injected server-side only.
 */
router.all(
  '/*',
  proxyLimiter,
  tokenAuthMiddleware,
  requestLogger('sap_dm'),
  async (req: TokenAuthenticatedRequest, res: Response) => {
    const conn = req.sapConnection!;

    // Build target URL: strip /gw/dm prefix, forward rest
    const subPath = req.originalUrl.replace(/^\/gw\/dm/, '');
    const targetUrl = `${conn.sap_base_url.replace(/\/$/, '')}${subPath}`;

    // Debug: log exact request being proxied to SAP
    console.log('[proxy-dm] %s %s → %s | body=%s | content-type=%s',
      req.method, req.originalUrl, targetUrl,
      req.body !== undefined ? JSON.stringify(req.body).substring(0, 100) : 'none',
      req.headers['content-type'] || 'none');

    try {
      const sapToken = await sapTokenService.getToken(conn.id);

      const result = await proxyRequest(req, res, targetUrl, {
        'Authorization': `Bearer ${sapToken}`,
      });

      // On 401: invalidate cache, retry once with fresh token
      if (result.statusCode === 401 && !res.headersSent) {
        sapTokenService.invalidate(conn.id);
        const freshToken = await sapTokenService.getToken(conn.id);
        await proxyRequest(req, res, targetUrl, {
          'Authorization': `Bearer ${freshToken}`,
        });
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to proxy request to SAP DM' });
      }
    }
  }
);

export default router;
