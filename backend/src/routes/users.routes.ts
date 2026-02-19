import { Router, Response } from 'express';
import { authMiddleware, requireTenantAdmin } from '../middleware/auth';
import { userService } from '../services/user.service';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.use(authMiddleware, requireTenantAdmin);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Superadmin can filter by tenantId; admin sees their active tenant
    let tenantId: string;
    if (req.user!.isSuperadmin && req.query.tenantId) {
      tenantId = req.query.tenantId as string;
    } else if (req.user!.activeTenantId) {
      tenantId = req.user!.activeTenantId;
    } else {
      res.status(400).json({ error: 'No active tenant' });
      return;
    }

    const users = await userService.listByTenant(tenantId);
    res.json(users);
  } catch (err) {
    console.error('List users error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, password, role, tenantId: bodyTenantId } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    if (role && !['admin', 'user'].includes(role)) {
      res.status(400).json({ error: 'Role must be "admin" or "user"' });
      return;
    }

    // Superadmin can specify tenantId; admin creates in their active tenant
    let tenantId: string;
    if (req.user!.isSuperadmin && bodyTenantId) {
      tenantId = bodyTenantId;
    } else if (req.user!.activeTenantId) {
      tenantId = req.user!.activeTenantId;
    } else {
      res.status(400).json({ error: 'No active tenant' });
      return;
    }

    const user = await userService.create({ username, password, tenantId, role });
    res.status(201).json(user);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    console.error('Create user error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Add existing user to a tenant (superadmin only) */
router.post('/:id/tenants', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user!.isSuperadmin) {
      res.status(403).json({ error: 'Superadmin access required' });
      return;
    }

    const { tenantId, role } = req.body;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }
    if (role && !['admin', 'user'].includes(role)) {
      res.status(400).json({ error: 'Role must be "admin" or "user"' });
      return;
    }

    await userService.addToTenant(req.params.id as string, tenantId, role || 'user');
    res.json({ message: 'User added to tenant' });
  } catch (err) {
    console.error('Add to tenant error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, password, role, is_active, isSuperadmin } = req.body;

    // Only superadmin can set is_superadmin
    if (isSuperadmin !== undefined && !req.user!.isSuperadmin) {
      res.status(403).json({ error: 'Only superadmins can set superadmin status' });
      return;
    }

    if (role && !['admin', 'user'].includes(role)) {
      res.status(400).json({ error: 'Role must be "admin" or "user"' });
      return;
    }

    // Update user fields
    const user = await userService.update(req.params.id as string, {
      username,
      password,
      is_active,
      isSuperadmin: req.user!.isSuperadmin ? isSuperadmin : undefined,
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Update per-tenant role if provided
    if (role && req.user!.activeTenantId) {
      await userService.updateTenantRole(
        req.params.id as string,
        req.user!.activeTenantId,
        role
      );
    }

    res.json(user);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    console.error('Update user error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Prevent self-deactivation
    if (req.user!.userId === (req.params.id as string)) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }

    const user = await userService.deactivate(req.params.id as string);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (err) {
    console.error('Delete user error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
