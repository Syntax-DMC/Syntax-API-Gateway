import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant } from '../middleware/auth';
import { logService } from '../services/log.service';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.use(authMiddleware, requireActiveTenant);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await logService.list({
      userId: req.user!.userId,
      tenantId: req.user!.activeTenantId!,
      target: req.query.target as 'agent' | 'sap_dm' | undefined,
      connectionId: req.query.connectionId as string | undefined,
      tokenId: req.query.tokenId as string | undefined,
      statusRange: req.query.status as '2xx' | '4xx' | '5xx' | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('List logs error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const period = (req.query.period as '24h' | '7d' | '30d') || '24h';
    if (!['24h', '7d', '30d'].includes(period)) {
      res.status(400).json({ error: 'period must be 24h, 7d, or 30d' });
      return;
    }

    const stats = await logService.stats(
      req.user!.userId,
      req.user!.activeTenantId!,
      req.query.connectionId as string | undefined,
      period
    );
    res.json(stats);
  } catch (err) {
    console.error('Log stats error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await logService.deleteAll(req.user!.userId, req.user!.activeTenantId!);
    res.json({ deleted });
  } catch (err) {
    console.error('Delete logs error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logId = req.params.id as string;
    const log = await logService.getById(logId, req.user!.userId, req.user!.activeTenantId!);
    if (!log) {
      res.status(404).json({ error: 'Log entry not found' });
      return;
    }
    res.json(log);
  } catch (err) {
    console.error('Get log error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
