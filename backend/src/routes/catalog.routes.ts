import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant } from '../middleware/auth';
import { catalogService } from '../services/catalog.service';
import { logService } from '../services/log.service';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authMiddleware, requireActiveTenant);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await catalogService.listByUserAndTenant(
      req.user!.userId,
      req.user!.activeTenantId!
    );
    res.json(items);
  } catch (err) {
    console.error('Catalog list error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to list catalog items' });
  }
});

router.get('/discovered', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.query.connectionId as string | undefined;
    const paths = await logService.distinctPaths(
      req.user!.userId,
      req.user!.activeTenantId!,
      connectionId
    );
    res.json(paths);
  } catch (err) {
    console.error('Discovered paths error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to fetch discovered paths' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, method, path, sap_connection_id, headers, body } = req.body;

    if (!title || !method || !path) {
      res.status(400).json({ error: 'title, method, and path are required' });
      return;
    }

    const item = await catalogService.create(req.user!.userId, req.user!.activeTenantId!, {
      title,
      method: String(method).toUpperCase(),
      path,
      sap_connection_id,
      headers,
      body,
    });
    res.status(201).json(item);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      res.status(409).json({ error: 'A catalog item with this title already exists' });
    } else {
      console.error('Catalog create error:', message);
      res.status(500).json({ error: 'Failed to create catalog item' });
    }
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { title, method, path, sap_connection_id, headers, body } = req.body;

    const updated = await catalogService.update(
      id,
      req.user!.userId,
      {
        title,
        method: method ? String(method).toUpperCase() : undefined,
        path,
        sap_connection_id,
        headers,
        body,
      },
      req.user!.activeTenantId!
    );

    if (!updated) {
      res.status(404).json({ error: 'Catalog item not found' });
      return;
    }
    res.json(updated);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
      res.status(409).json({ error: 'A catalog item with this title already exists' });
    } else {
      console.error('Catalog update error:', message);
      res.status(500).json({ error: 'Failed to update catalog item' });
    }
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const deleted = await catalogService.delete(id, req.user!.userId, req.user!.activeTenantId!);
    if (!deleted) {
      res.status(404).json({ error: 'Catalog item not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Catalog delete error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to delete catalog item' });
  }
});

export default router;
