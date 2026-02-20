import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant, requireTenantAdmin } from '../middleware/auth';
import { useCaseService } from '../services/use-case.service';
import type { AuthenticatedRequest } from '../types';

const router = Router();

router.use(authMiddleware, requireActiveTenant);

// GET / — List use-case templates
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, tags, active } = req.query;
    const filters: { search?: string; tags?: string[]; is_active?: boolean } = {};
    if (typeof search === 'string' && search) filters.search = search;
    if (typeof tags === 'string' && tags) filters.tags = tags.split(',');
    if (active === 'true') filters.is_active = true;
    if (active === 'false') filters.is_active = false;

    const templates = await useCaseService.listByTenant(req.user!.activeTenantId!, filters);
    res.json(templates);
  } catch (err) {
    console.error('List use-cases error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id — Get single template
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await useCaseService.getById(req.params.id as string, req.user!.activeTenantId!);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (err) {
    console.error('Get use-case error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST / — Create template
router.post('/', requireTenantAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, slug, description, required_context, calls, mode, tags, is_active } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const template = await useCaseService.create(req.user!.activeTenantId!, req.user!.userId, {
      name,
      slug,
      description,
      required_context,
      calls,
      mode,
      tags,
      is_active,
    });
    res.status(201).json(template);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'A template with this slug already exists' });
      return;
    }
    console.error('Create use-case error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id — Update template
router.patch('/:id', requireTenantAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await useCaseService.update(
      req.params.id as string,
      req.user!.activeTenantId!,
      req.body
    );
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'A template with this slug already exists' });
      return;
    }
    console.error('Update use-case error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id — Delete template
router.delete('/:id', requireTenantAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await useCaseService.delete(req.params.id as string, req.user!.activeTenantId!);
    if (!deleted) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('Delete use-case error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/validate — Dry-run: check all referenced slugs exist
router.post('/:id/validate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const template = await useCaseService.getById(req.params.id as string, req.user!.activeTenantId!);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const result = await useCaseService.validate(template.slug, req.user!.activeTenantId!);
    res.json(result);
  } catch (err) {
    console.error('Validate use-case error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/test — Admin test execution
router.post('/:id/test', requireTenantAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { connectionId, context } = req.body;
    if (!connectionId) {
      res.status(400).json({ error: 'connectionId is required' });
      return;
    }
    if (!context || typeof context !== 'object') {
      res.status(400).json({ error: 'context object is required' });
      return;
    }

    const template = await useCaseService.getById(req.params.id as string, req.user!.activeTenantId!);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const result = await useCaseService.execute(
      template.slug,
      connectionId,
      req.user!.activeTenantId!,
      req.user!.userId,
      context
    );
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else if (message.includes('Missing required')) {
      res.status(400).json({ error: message });
    } else {
      console.error('Test use-case error:', message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
