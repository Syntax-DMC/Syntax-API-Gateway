import { Router, Response } from 'express';
import { tokenAuthMiddleware } from '../middleware/token-auth';
import { proxyLimiter } from '../middleware/rate-limit';
import { orchestratorService } from '../services/orchestrator.service';
import { TokenAuthenticatedRequest, OrchestratorApiCall } from '../types';

const router = Router();

const MAX_CALLS = 20;

function validateCalls(calls: unknown, res: Response): calls is OrchestratorApiCall[] {
  if (!Array.isArray(calls) || calls.length === 0) {
    res.status(400).json({ error: 'calls must be a non-empty array' });
    return false;
  }
  if (calls.length > MAX_CALLS) {
    res.status(400).json({ error: `Maximum ${MAX_CALLS} calls per request` });
    return false;
  }
  for (let i = 0; i < calls.length; i++) {
    if (!calls[i].slug || typeof calls[i].slug !== 'string') {
      res.status(400).json({ error: `calls[${i}].slug must be a non-empty string` });
      return false;
    }
  }
  return true;
}

router.post(
  '/',
  proxyLimiter,
  tokenAuthMiddleware,
  async (req: TokenAuthenticatedRequest, res: Response) => {
    try {
      const { calls, mode, slugs, context, overrides } = req.body;
      const token = req.apiToken!;
      const conn = req.sapConnection!;

      // New auto-resolved format: { slugs: [...], context: {...} }
      if (Array.isArray(slugs) && slugs.length > 0) {
        if (slugs.length > MAX_CALLS) {
          res.status(400).json({ error: `Maximum ${MAX_CALLS} slugs per request` });
          return;
        }
        if (!context || typeof context !== 'object') {
          res.status(400).json({ error: 'context object is required with slugs format' });
          return;
        }

        const result = await orchestratorService.executeAutoResolved(
          conn.id,
          token.tenant_id,
          token.user_id,
          slugs,
          context,
          overrides
        );
        res.json(result);
        return;
      }

      // Old explicit format: { calls: [...], mode }
      if (!validateCalls(calls, res)) return;

      const execMode = mode === 'sequential' ? 'sequential' : 'parallel';

      const result = await orchestratorService.executeQuery(
        conn.id,
        token.tenant_id,
        token.user_id,
        calls,
        execMode
      );

      res.json(result);
    } catch (err) {
      console.error('Orchestrator error:', (err as Error).message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/validate',
  proxyLimiter,
  tokenAuthMiddleware,
  async (req: TokenAuthenticatedRequest, res: Response) => {
    try {
      const { calls, mode } = req.body;

      if (!validateCalls(calls, res)) return;

      const execMode = mode === 'sequential' ? 'sequential' : 'parallel';
      const token = req.apiToken!;

      const plan = await orchestratorService.validateQuery(
        token.tenant_id,
        calls,
        execMode
      );

      res.json(plan);
    } catch (err) {
      console.error('Orchestrator validate error:', (err as Error).message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
