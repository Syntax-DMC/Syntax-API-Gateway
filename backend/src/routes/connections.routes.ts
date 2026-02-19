import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant } from '../middleware/auth';
import { connectionService } from '../services/connection.service';
import { validateUpstreamUrlDns } from '../utils/url-validator';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.use(authMiddleware, requireActiveTenant);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connections = await connectionService.listByUserAndTenant(
      req.user!.userId,
      req.user!.activeTenantId!
    );
    res.json(connections);
  } catch (err) {
    console.error('List connections error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const conn = await connectionService.getById(
      req.params.id as string,
      req.user!.userId,
      req.user!.activeTenantId!
    );
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json(conn);
  } catch (err) {
    console.error('Get connection error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, sapBaseUrl, tokenUrl, clientId, clientSecret, agentApiUrl, agentApiKey } = req.body;

    if (!name || !sapBaseUrl || !tokenUrl || !clientId || !clientSecret) {
      res.status(400).json({
        error: 'name, sapBaseUrl, tokenUrl, clientId, and clientSecret are required',
      });
      return;
    }

    // Validate all user-supplied URLs against SSRF
    for (const [label, url] of [['sapBaseUrl', sapBaseUrl], ['tokenUrl', tokenUrl], ['agentApiUrl', agentApiUrl]] as const) {
      if (!url) continue;
      const result = await validateUpstreamUrlDns(url);
      if (!result.valid) {
        res.status(400).json({ error: `${label}: ${result.error}` });
        return;
      }
    }

    const conn = await connectionService.create(req.user!.userId, req.user!.activeTenantId!, {
      name,
      sapBaseUrl,
      tokenUrl,
      clientId,
      clientSecret,
      agentApiUrl,
      agentApiKey,
    });
    res.status(201).json(conn);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'A connection with this name already exists' });
      return;
    }
    console.error('Create connection error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, sapBaseUrl, tokenUrl, clientId, clientSecret, agentApiUrl, agentApiKey, is_active } = req.body;

    // Validate any URLs being updated against SSRF
    for (const [label, url] of [['sapBaseUrl', sapBaseUrl], ['tokenUrl', tokenUrl], ['agentApiUrl', agentApiUrl]] as const) {
      if (!url) continue;
      const result = await validateUpstreamUrlDns(url);
      if (!result.valid) {
        res.status(400).json({ error: `${label}: ${result.error}` });
        return;
      }
    }

    const conn = await connectionService.update(
      req.params.id as string,
      req.user!.userId,
      { name, sapBaseUrl, tokenUrl, clientId, clientSecret, agentApiUrl, agentApiKey, is_active },
      req.user!.activeTenantId!
    );

    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    res.json(conn);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'A connection with this name already exists' });
      return;
    }
    console.error('Update connection error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await connectionService.delete(
      req.params.id as string,
      req.user!.userId,
      req.user!.activeTenantId!
    );
    if (!deleted) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json({ message: 'Connection deleted' });
  } catch (err) {
    console.error('Delete connection error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const conn = await connectionService.getById(
      req.params.id as string,
      req.user!.userId,
      req.user!.activeTenantId!
    );
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    const result: Record<string, unknown> = {
      status: 'ok',
      connectionId: conn.id,
      name: conn.name,
      sapBaseUrl: conn.sap_base_url,
      hasAgentConfig: conn.has_agent_config,
    };

    res.json(result);
  } catch (err) {
    console.error('Test connection error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
