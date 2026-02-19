import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant } from '../middleware/auth';
import { apiTokenService } from '../services/api-token.service';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.use(authMiddleware, requireActiveTenant);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tokens = await apiTokenService.listByUserAndTenant(
      req.user!.userId,
      req.user!.activeTenantId!
    );
    res.json(tokens);
  } catch (err) {
    console.error('List tokens error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sapConnectionId, label, expiresAt } = req.body;

    if (!sapConnectionId || !label) {
      res.status(400).json({ error: 'sapConnectionId and label are required' });
      return;
    }

    const result = await apiTokenService.create(
      req.user!.userId,
      req.user!.activeTenantId!,
      { sapConnectionId, label, expiresAt }
    );

    res.status(201).json({
      token: result.token,
      ...result.tokenData,
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'Connection not found') {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Create token error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { label, is_active } = req.body;

    const token = await apiTokenService.update(
      req.params.id as string,
      req.user!.userId,
      { label, is_active },
      req.user!.activeTenantId!
    );

    if (!token) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    res.json(token);
  } catch (err) {
    console.error('Update token error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await apiTokenService.delete(
      req.params.id as string,
      req.user!.userId,
      req.user!.activeTenantId!
    );
    if (!deleted) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }
    res.json({ message: 'Token revoked' });
  } catch (err) {
    console.error('Delete token error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
