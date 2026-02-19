import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant } from '../middleware/auth';
import { explorerService } from '../services/explorer.service';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authMiddleware, requireActiveTenant);

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

router.post('/execute', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { connectionId, method, path, headers, body } = req.body;

    if (!connectionId || !method || !path) {
      res.status(400).json({ error: 'connectionId, method, and path are required' });
      return;
    }

    const upperMethod = String(method).toUpperCase();
    if (!ALLOWED_METHODS.includes(upperMethod)) {
      res.status(400).json({ error: `method must be one of: ${ALLOWED_METHODS.join(', ')}` });
      return;
    }

    if (!String(path).startsWith('/')) {
      res.status(400).json({ error: 'path must start with /' });
      return;
    }

    const result = await explorerService.execute(req.user!.userId, req.user!.activeTenantId!, {
      connectionId,
      method: upperMethod,
      path: String(path),
      headers: headers || undefined,
      body: body || undefined,
    });

    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else if (message.includes('not active')) {
      res.status(400).json({ error: message });
    } else {
      console.error('Explorer execute error:', message);
      res.status(502).json({ error: message || 'Failed to execute request' });
    }
  }
});

export default router;
