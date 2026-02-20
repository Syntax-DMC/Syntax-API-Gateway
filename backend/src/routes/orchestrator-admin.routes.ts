import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant } from '../middleware/auth';
import { autoResolverService } from '../services/auto-resolver.service';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authMiddleware, requireActiveTenant);

const MAX_CALLS = 20;

// POST /auto-resolve-preview — Preview auto-resolution for the wizard Flow Designer
router.post('/auto-resolve-preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { slugs, context, overrides } = req.body;

    if (!Array.isArray(slugs) || slugs.length === 0) {
      res.status(400).json({ error: 'slugs array is required' });
      return;
    }
    if (slugs.length > MAX_CALLS) {
      res.status(400).json({ error: `Maximum ${MAX_CALLS} slugs per request` });
      return;
    }

    const result = await autoResolverService.resolve(
      slugs,
      context || {},
      req.user!.activeTenantId!,
      overrides
    );

    res.json(result);
  } catch (err) {
    console.error('Auto-resolve preview error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
