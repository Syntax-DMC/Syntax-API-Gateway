import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant, requireTenantAdmin } from '../middleware/auth';
import { registryService } from '../services/registry.service';
import { openApiParserService } from '../services/openapi-parser.service';
import { assignmentService } from '../services/assignment.service';
import { explorerService } from '../services/explorer.service';
import { AuthenticatedRequest } from '../types';

const router = Router();

// All routes require auth + active tenant
router.use(authMiddleware, requireActiveTenant);

// GET / — List with optional filters
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters: Record<string, unknown> = {};
    if (req.query.tags) {
      filters.tags = (req.query.tags as string).split(',').map(t => t.trim()).filter(Boolean);
    }
    if (req.query.method) filters.method = req.query.method as string;
    if (req.query.search) filters.search = req.query.search as string;
    if (req.query.active !== undefined) filters.is_active = req.query.active === 'true';

    const definitions = await registryService.listByTenant(req.user!.activeTenantId!, filters);
    res.json(definitions);
  } catch (err) {
    console.error('List registry error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id — Single definition
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const def = await registryService.getById(req.params.id as string, req.user!.activeTenantId!);
    if (!def) {
      res.status(404).json({ error: 'API definition not found' });
      return;
    }
    res.json(def);
  } catch (err) {
    console.error('Get registry error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /slug/:slug — Lookup by slug
router.get('/slug/:slug', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const def = await registryService.getBySlug(req.params.slug as string, req.user!.activeTenantId!);
    if (!def) {
      res.status(404).json({ error: 'API definition not found' });
      return;
    }
    res.json(def);
  } catch (err) {
    console.error('Get registry by slug error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST / — Create (admin only)
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { slug, name, description, version, spec_format, method, path, query_params, request_headers, request_body, response_schema, provides, depends_on, tags, is_active } = req.body;

    if (!name || !method || !path) {
      res.status(400).json({ error: 'name, method, and path are required' });
      return;
    }

    const def = await registryService.create(req.user!.activeTenantId!, req.user!.userId, {
      slug, name, description, version, spec_format, method, path,
      query_params, request_headers, request_body, response_schema,
      provides, depends_on, tags, is_active,
    });
    res.status(201).json(def);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'An API definition with this slug already exists' });
      return;
    }
    console.error('Create registry error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id — Update (admin only)
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const def = await registryService.update(
      req.params.id as string,
      req.user!.activeTenantId!,
      req.user!.userId,
      req.body
    );
    if (!def) {
      res.status(404).json({ error: 'API definition not found' });
      return;
    }
    res.json(def);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'An API definition with this slug already exists' });
      return;
    }
    console.error('Update registry error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id — Delete (admin only)
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await registryService.delete(req.params.id as string, req.user!.activeTenantId!);
    if (!deleted) {
      res.status(404).json({ error: 'API definition not found' });
      return;
    }
    res.json({ message: 'API definition deleted' });
  } catch (err) {
    console.error('Delete registry error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /import — Import OpenAPI spec(s) (admin only)
// Accepts either { spec } for single or { specs: [{name, content}] } for batch
router.post('/import', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { spec, specs, tags, preview } = req.body;

    // Build array of specs to process
    const specList: { name: string; content: string }[] = [];
    if (Array.isArray(specs) && specs.length > 0) {
      specList.push(...specs);
    } else if (spec) {
      specList.push({ name: 'spec', content: spec });
    } else {
      res.status(400).json({ error: 'spec or specs is required' });
      return;
    }

    const extraTags = tags || [];
    const results: Array<{
      name: string;
      title?: string;
      version?: string;
      spec_format?: string;
      endpoints?: unknown[];
      created?: number;
      skipped?: number;
      errors: string[];
      error?: string;
    }> = [];

    for (const item of specList) {
      try {
        const parseResult = await openApiParserService.parseSpec(item.content);

        if (parseResult.errors.length > 0 && parseResult.endpoints.length === 0) {
          results.push({ name: item.name, errors: parseResult.errors, error: 'Failed to parse spec' });
          continue;
        }

        const endpoints = parseResult.endpoints.map(ep => ({
          ...ep,
          tags: [...new Set([...ep.tags, ...extraTags])],
          version: parseResult.version,
          spec_format: parseResult.spec_format,
        }));

        if (preview) {
          results.push({
            name: item.name,
            title: parseResult.title,
            version: parseResult.version,
            spec_format: parseResult.spec_format,
            endpoints,
            errors: parseResult.errors,
          });
        } else {
          const bulkResult = await registryService.bulkCreate(
            req.user!.activeTenantId!,
            req.user!.userId,
            endpoints
          );
          results.push({
            name: item.name,
            title: parseResult.title,
            ...bulkResult,
            errors: [...parseResult.errors, ...bulkResult.errors],
          });
        }
      } catch (err) {
        results.push({ name: item.name, errors: [(err as Error).message] });
      }
    }

    // Single-spec backward compatibility: return single object if only one spec was provided via `spec`
    if (!Array.isArray(specs) && results.length === 1) {
      const r = results[0];
      // Remove `name` field for backward compat
      const { name: _name, ...rest } = r;
      res.json(rest);
      return;
    }

    res.json(results);
  } catch (err) {
    console.error('Import registry error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Connection Assignments ────────────────────────────────────

// GET /:id/assignments — List connections assigned to this API def
router.get('/:id/assignments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const def = await registryService.getById(req.params.id as string, req.user!.activeTenantId!);
    if (!def) {
      res.status(404).json({ error: 'API definition not found' });
      return;
    }
    const assignments = await assignmentService.listByDefinition(
      req.params.id as string,
      req.user!.activeTenantId!
    );
    res.json(assignments);
  } catch (err) {
    console.error('List assignments error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/assignments — Assign a connection (admin only)
router.post('/:id/assignments', requireTenantAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { connectionId } = req.body;
    if (!connectionId) {
      res.status(400).json({ error: 'connectionId is required' });
      return;
    }
    const assignment = await assignmentService.assign(
      req.user!.activeTenantId!,
      req.user!.userId,
      connectionId,
      req.params.id as string
    );
    res.status(201).json(assignment);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    if (message.includes('duplicate key') || message.includes('unique')) {
      res.status(409).json({ error: 'This connection is already assigned' });
      return;
    }
    console.error('Assign connection error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id/assignments/:assignmentId — Unassign (admin only)
router.delete('/:id/assignments/:assignmentId', requireTenantAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await assignmentService.unassign(
      (req.params as Record<string, string>).assignmentId,
      req.user!.activeTenantId!
    );
    if (!deleted) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }
    res.json({ message: 'Assignment removed' });
  } catch (err) {
    console.error('Unassign connection error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Single-API Test ──────────────────────────────────────────

// POST /:id/test — Execute test API call against SAP DM
router.post('/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const def = await registryService.getById(req.params.id as string, req.user!.activeTenantId!);
    if (!def) {
      res.status(404).json({ error: 'API definition not found' });
      return;
    }

    const { connectionId, params, headers, body } = req.body;
    if (!connectionId) {
      res.status(400).json({ error: 'connectionId is required' });
      return;
    }

    // Build final path from definition path + user-supplied params
    let finalPath = def.path;

    // Substitute path parameters: {plant} -> value
    if (params) {
      for (const [key, value] of Object.entries(params as Record<string, string>)) {
        finalPath = finalPath.replace(`{${key}}`, encodeURIComponent(value));
      }
    }

    // Append query parameters that match definition's query_params
    const queryParts: string[] = [];
    if (def.query_params && def.query_params.length > 0 && params) {
      for (const qp of def.query_params) {
        const val = (params as Record<string, string>)[qp.name];
        if (val !== undefined && val !== '') {
          // Only add as query param if not already a path param substitution
          if (!def.path.includes(`{${qp.name}}`)) {
            queryParts.push(`${encodeURIComponent(qp.name)}=${encodeURIComponent(val)}`);
          }
        }
      }
    }
    if (queryParts.length > 0) {
      finalPath += (finalPath.includes('?') ? '&' : '?') + queryParts.join('&');
    }

    const result = await explorerService.execute(
      req.user!.userId,
      req.user!.activeTenantId!,
      {
        connectionId,
        method: def.method,
        path: finalPath,
        headers: headers || undefined,
        body: body || undefined,
      }
    );
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else if (message.includes('not active')) {
      res.status(400).json({ error: message });
    } else {
      console.error('Registry test error:', message);
      res.status(502).json({ error: message || 'Failed to execute test' });
    }
  }
});

// GET /:id/versions — Version history
router.get('/:id/versions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const versions = await registryService.getVersions(req.params.id as string, req.user!.activeTenantId!);
    res.json(versions);
  } catch (err) {
    console.error('Get versions error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id/versions/:num — Single version snapshot
router.get('/:id/versions/:num', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const version = await registryService.getVersion(
      req.params.id as string,
      parseInt(req.params.num as string, 10),
      req.user!.activeTenantId!
    );
    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json(version);
  } catch (err) {
    console.error('Get version error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/revert/:num — Revert to version (admin only)
router.post('/:id/revert/:num', requireTenantAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const def = await registryService.revertToVersion(
      req.params.id as string,
      parseInt(req.params.num as string, 10),
      req.user!.activeTenantId!,
      req.user!.userId
    );
    if (!def) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json(def);
  } catch (err) {
    console.error('Revert version error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
