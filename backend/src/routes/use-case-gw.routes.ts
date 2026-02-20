import { Router, Response } from 'express';
import { tokenAuthMiddleware } from '../middleware/token-auth';
import { proxyLimiter } from '../middleware/rate-limit';
import { requestLogger } from '../middleware/request-logger';
import { useCaseService } from '../services/use-case.service';
import type { TokenAuthenticatedRequest } from '../types';

const router = Router();

// GET / — Discovery: list available use-case templates
router.get(
  '/',
  proxyLimiter,
  tokenAuthMiddleware,
  async (req: TokenAuthenticatedRequest, res: Response) => {
    try {
      const token = req.apiToken!;
      const templates = await useCaseService.listAvailable(token.tenant_id);
      res.json(templates);
    } catch (err) {
      console.error('Use-case list error:', (err as Error).message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /:slug — Execute a use-case template
router.post(
  '/:slug',
  proxyLimiter,
  tokenAuthMiddleware,
  requestLogger('sap_dm'),
  async (req: TokenAuthenticatedRequest, res: Response) => {
    try {
      const { context } = req.body;
      if (!context || typeof context !== 'object') {
        res.status(400).json({ error: 'context object is required in request body' });
        return;
      }

      const slug = req.params.slug as string;
      const token = req.apiToken!;
      const conn = req.sapConnection!;

      const result = await useCaseService.execute(
        slug,
        conn.id,
        token.tenant_id,
        token.user_id,
        context
      );

      res.json(result);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else if (message.includes('Missing required')) {
        res.status(400).json({ error: message });
      } else if (message.includes('inactive')) {
        res.status(400).json({ error: message });
      } else {
        console.error('Use-case execute error:', message);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }
);

export default router;
