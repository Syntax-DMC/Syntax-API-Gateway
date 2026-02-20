import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant } from '../middleware/auth';
import { orchestratorService } from '../services/orchestrator.service';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authMiddleware, requireActiveTenant);

const MAX_SLUGS = 20;

/**
 * POST /api/emulator/execute
 * Executes an orchestrated query using JWT auth (no API key needed).
 * Same as POST /gw/query but authenticated via admin JWT + connectionId.
 */
router.post('/execute', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { connectionId, slugs, context } = req.body;
    const user = req.user!;

    if (!connectionId || typeof connectionId !== 'string') {
      res.status(400).json({ error: 'connectionId is required' });
      return;
    }

    if (!Array.isArray(slugs) || slugs.length === 0) {
      res.status(400).json({ error: 'slugs must be a non-empty array' });
      return;
    }

    if (slugs.length > MAX_SLUGS) {
      res.status(400).json({ error: `Maximum ${MAX_SLUGS} slugs per request` });
      return;
    }

    if (!context || typeof context !== 'object') {
      res.status(400).json({ error: 'context object is required' });
      return;
    }

    const result = await orchestratorService.executeAutoResolved(
      connectionId,
      user.activeTenantId!,
      user.userId,
      slugs,
      context
    );

    res.json(result);
  } catch (err) {
    console.error('Emulator execute error:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message || 'Internal server error' });
  }
});

export default router;
