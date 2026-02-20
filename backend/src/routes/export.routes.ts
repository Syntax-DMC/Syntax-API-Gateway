import { Router, Response } from 'express';
import { authMiddleware, requireActiveTenant, requireTenantAdmin } from '../middleware/auth';
import { exportService } from '../services/export.service';
import { AuthenticatedRequest, ExportFormat, ExportScope } from '../types';

const router = Router();

router.use(authMiddleware, requireActiveTenant, requireTenantAdmin);

const VALID_FORMATS: ExportFormat[] = ['openapi3_json', 'openapi3_yaml', 'swagger2_json'];
const VALID_SCOPES: ExportScope[] = ['all', 'assigned'];

// GET / – List connections with export metadata
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connections = await exportService.listConnectionsWithExportMeta(
      req.user!.userId,
      req.user!.activeTenantId!
    );
    res.json(connections);
  } catch (err) {
    console.error('List export connections error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /connections/:id – Generate & download spec
router.get('/connections/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const format = (req.query.format as string) || 'openapi3_json';
    const scope = (req.query.scope as string) || 'all';
    const gatewayUrl = (req.query.gatewayUrl as string) || `${req.protocol}://${req.get('host')}`;

    if (!VALID_FORMATS.includes(format as ExportFormat)) {
      res.status(400).json({ error: `Invalid format. Valid: ${VALID_FORMATS.join(', ')}` });
      return;
    }
    if (!VALID_SCOPES.includes(scope as ExportScope)) {
      res.status(400).json({ error: `Invalid scope. Valid: ${VALID_SCOPES.join(', ')}` });
      return;
    }

    const result = await exportService.generateSpec({
      connectionId: req.params.id as string,
      tenantId: req.user!.activeTenantId!,
      format: format as ExportFormat,
      scope: scope as ExportScope,
      gatewayUrl,
    });

    exportService.logExport(
      req.user!.activeTenantId!,
      req.user!.userId,
      req.params.id as string,
      format,
      scope,
      result.apiCount
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Generate spec error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /connections/:id/preview – Return spec as JSON wrapper for UI preview
router.get('/connections/:id/preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const format = (req.query.format as string) || 'openapi3_json';
    const scope = (req.query.scope as string) || 'all';
    const gatewayUrl = (req.query.gatewayUrl as string) || `${req.protocol}://${req.get('host')}`;

    if (!VALID_FORMATS.includes(format as ExportFormat)) {
      res.status(400).json({ error: `Invalid format. Valid: ${VALID_FORMATS.join(', ')}` });
      return;
    }
    if (!VALID_SCOPES.includes(scope as ExportScope)) {
      res.status(400).json({ error: `Invalid scope. Valid: ${VALID_SCOPES.join(', ')}` });
      return;
    }

    const result = await exportService.generateSpec({
      connectionId: req.params.id as string,
      tenantId: req.user!.activeTenantId!,
      format: format as ExportFormat,
      scope: scope as ExportScope,
      gatewayUrl,
    });

    res.json({
      content: result.content,
      contentType: result.contentType,
      filename: result.filename,
      apiCount: result.apiCount,
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Preview spec error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /connections/:id/toolkit-config – Generate toolkit config JSON
router.get('/connections/:id/toolkit-config', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gatewayUrl = (req.query.gatewayUrl as string) || `${req.protocol}://${req.get('host')}`;

    const config = await exportService.generateToolkitConfig(
      req.params.id as string,
      req.user!.activeTenantId!,
      gatewayUrl
    );

    res.json(config);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Generate toolkit config error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /connections/:id/use-cases – Download use-case OpenAPI spec
router.get('/connections/:id/use-cases', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gatewayUrl = (req.query.gatewayUrl as string) || `${req.protocol}://${req.get('host')}`;
    const result = await exportService.generateUseCaseSpec(req.user!.activeTenantId!, gatewayUrl);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    console.error('Generate use-case spec error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /connections/:id/use-cases/preview – Preview use-case spec for UI
router.get('/connections/:id/use-cases/preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gatewayUrl = (req.query.gatewayUrl as string) || `${req.protocol}://${req.get('host')}`;
    const result = await exportService.generateUseCaseSpec(req.user!.activeTenantId!, gatewayUrl);

    res.json({
      content: result.content,
      contentType: result.contentType,
      filename: result.filename,
    });
  } catch (err) {
    console.error('Preview use-case spec error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /connections/:id/prompt-spec – Download prompt specification markdown
router.get('/connections/:id/prompt-spec', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gatewayUrl = (req.query.gatewayUrl as string) || `${req.protocol}://${req.get('host')}`;
    const result = await exportService.generatePromptSpec(req.user!.activeTenantId!, gatewayUrl);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    console.error('Generate prompt spec error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /connections/:id/prompt-spec/preview – Preview prompt spec for UI
router.get('/connections/:id/prompt-spec/preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gatewayUrl = (req.query.gatewayUrl as string) || `${req.protocol}://${req.get('host')}`;
    const result = await exportService.generatePromptSpec(req.user!.activeTenantId!, gatewayUrl);

    res.json({
      content: result.content,
      contentType: result.contentType,
      filename: result.filename,
    });
  } catch (err) {
    console.error('Preview prompt spec error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
