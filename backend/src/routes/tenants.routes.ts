import { Router, Response } from 'express';
import { authMiddleware, requireSuperadmin } from '../middleware/auth';
import { tenantService } from '../services/tenant.service';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.use(authMiddleware, requireSuperadmin);

router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const tenants = await tenantService.list();
    res.json(tenants);
  } catch (err) {
    console.error('List tenants error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant = await tenantService.getById(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    res.json(tenant);
  } catch (err) {
    console.error('Get tenant error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, slug } = req.body;

    if (!name || !slug) {
      res.status(400).json({ error: 'name and slug are required' });
      return;
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: 'slug must contain only lowercase letters, numbers, and hyphens' });
      return;
    }

    const tenant = await tenantService.create({ name, slug });
    res.status(201).json(tenant);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'Tenant name or slug already exists' });
      return;
    }
    console.error('Create tenant error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, slug, is_active } = req.body;

    if (slug !== undefined && !/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: 'slug must contain only lowercase letters, numbers, and hyphens' });
      return;
    }

    const tenant = await tenantService.update(req.params.id as string, { name, slug, is_active });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    res.json(tenant);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('Cannot deactivate the Platform tenant')) {
      res.status(400).json({ error: message });
      return;
    }
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'Tenant name or slug already exists' });
      return;
    }
    console.error('Update tenant error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
