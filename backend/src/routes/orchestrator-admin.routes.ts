import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant } from '../middleware/auth';
import { orchestratorService } from '../services/orchestrator.service';
import { AuthenticatedRequest, OrchestratorApiCall } from '../types';

const router = Router();
router.use(authMiddleware, requireActiveTenant);

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

router.post('/execute', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { connectionId, calls, mode } = req.body;

    if (!connectionId) {
      res.status(400).json({ error: 'connectionId is required' });
      return;
    }
    if (!validateCalls(calls, res)) return;

    const execMode = mode === 'sequential' ? 'sequential' : 'parallel';

    const result = await orchestratorService.executeQuery(
      connectionId,
      req.user!.activeTenantId!,
      req.user!.userId,
      calls,
      execMode
    );

    res.json(result);
  } catch (err) {
    console.error('Orchestrator admin execute error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/validate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { calls, mode } = req.body;

    if (!validateCalls(calls, res)) return;

    const execMode = mode === 'sequential' ? 'sequential' : 'parallel';

    const plan = await orchestratorService.validateQuery(
      req.user!.activeTenantId!,
      calls,
      execMode
    );

    res.json(plan);
  } catch (err) {
    console.error('Orchestrator admin validate error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
