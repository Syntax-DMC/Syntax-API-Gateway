import { Router, Response } from 'express';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { authMiddleware, requireActiveTenant } from '../middleware/auth';
import { connectionService } from '../services/connection.service';
import { sapTokenService } from '../services/sap-token.service';
import { assignmentService } from '../services/assignment.service';
import { validateUpstreamUrlDns } from '../utils/url-validator';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.use(authMiddleware, requireActiveTenant);

// ── Pre-save test endpoints (must be BEFORE /:id routes) ──

// POST /test-url — Test URL reachability
router.post('/test-url', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ status: 'error', message: 'url is required' });
      return;
    }

    const ssrf = await validateUpstreamUrlDns(url);
    if (!ssrf.valid) {
      res.status(400).json({ status: 'error', message: ssrf.error });
      return;
    }

    const start = Date.now();
    try {
      await httpHead(url, 5000);
      res.json({ status: 'ok', responseTime: Date.now() - start });
    } catch (err) {
      res.json({ status: 'error', message: (err as Error).message, responseTime: Date.now() - start });
    }
  } catch (err) {
    console.error('Test URL error:', (err as Error).message);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// POST /test-oauth — Test OAuth2 client_credentials token fetch
router.post('/test-oauth', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token_url, client_id, client_secret } = req.body;
    if (!token_url || !client_id || !client_secret) {
      res.status(400).json({ status: 'error', message: 'token_url, client_id, and client_secret are required' });
      return;
    }

    const ssrf = await validateUpstreamUrlDns(token_url);
    if (!ssrf.valid) {
      res.status(400).json({ status: 'error', message: `token_url: ${ssrf.error}` });
      return;
    }

    try {
      const tokenData = await fetchOAuthTokenDirect(token_url, client_id, client_secret);
      res.json({ status: 'ok', expiresIn: tokenData.expires_in });
    } catch (err) {
      res.json({ status: 'error', message: (err as Error).message });
    }
  } catch (err) {
    console.error('Test OAuth error:', (err as Error).message);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// POST /test-agent — Test agent API reachability
router.post('/test-agent', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agent_api_url, agent_api_key } = req.body;
    if (!agent_api_url) {
      res.status(400).json({ status: 'error', message: 'agent_api_url is required' });
      return;
    }

    const ssrf = await validateUpstreamUrlDns(agent_api_url);
    if (!ssrf.valid) {
      res.status(400).json({ status: 'error', message: `agent_api_url: ${ssrf.error}` });
      return;
    }

    const start = Date.now();
    try {
      await httpHead(agent_api_url, 5000, agent_api_key ? { 'Authorization': `Bearer ${agent_api_key}` } : undefined);
      res.json({ status: 'ok', responseTime: Date.now() - start });
    } catch (err) {
      res.json({ status: 'error', message: (err as Error).message, responseTime: Date.now() - start });
    }
  } catch (err) {
    console.error('Test agent error:', (err as Error).message);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// ── Standard CRUD routes ──────────────────────────────────

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

// POST /:id/test — Test existing connection (actually fetch OAuth2 token)
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

    try {
      await sapTokenService.getToken(conn.id);
      res.json({
        status: 'ok',
        connectionId: conn.id,
        name: conn.name,
        sapBaseUrl: conn.sap_base_url,
        hasAgentConfig: conn.has_agent_config,
      });
    } catch (err) {
      res.json({
        status: 'error',
        message: (err as Error).message,
        connectionId: conn.id,
        name: conn.name,
      });
    }
  } catch (err) {
    console.error('Test connection error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:id/assign-apis — Bulk assign multiple APIs to this connection
router.post('/:id/assign-apis', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { apiDefinitionIds } = req.body;
    if (!Array.isArray(apiDefinitionIds) || apiDefinitionIds.length === 0) {
      res.status(400).json({ error: 'apiDefinitionIds array is required and must not be empty' });
      return;
    }

    const conn = await connectionService.getById(
      req.params.id as string,
      req.user!.userId,
      req.user!.activeTenantId!
    );
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    const result = await assignmentService.bulkAssign(
      req.user!.activeTenantId!,
      req.user!.userId,
      req.params.id as string,
      apiDefinitionIds
    );

    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    console.error('Bulk assign error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

// ── Helper functions ──────────────────────────────────────

function httpHead(url: string, timeoutMs: number, extraHeaders?: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'HEAD',
        headers: { ...extraHeaders },
        timeout: timeoutMs,
      },
      (res) => {
        res.resume(); // drain
        resolve(res.statusCode || 0);
      }
    );

    req.on('error', (err) => reject(new Error(`Connection failed: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out (${timeoutMs}ms)`));
    });
    req.end();
  });
}

function fetchOAuthTokenDirect(
  tokenUrl: string,
  clientId: string,
  clientSecret: string
): Promise<{ expires_in: number }> {
  return new Promise((resolve, reject) => {
    const body = 'grant_type=client_credentials';
    const parsed = new URL(tokenUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json',
        },
        timeout: 10_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode >= 400) {
            if (res.statusCode === 401) {
              reject(new Error('Invalid credentials — check Client ID and Client Secret'));
            } else {
              reject(new Error(`Token request failed (${res.statusCode}): ${raw.substring(0, 200)}`));
            }
            return;
          }
          try {
            const data = JSON.parse(raw);
            if (!data.access_token) {
              reject(new Error('Token response missing access_token'));
              return;
            }
            resolve({ expires_in: data.expires_in || 3600 });
          } catch {
            reject(new Error('Invalid JSON in token response'));
          }
        });
      }
    );

    req.on('error', (err) => reject(new Error(`Connection failed: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out — the token endpoint may be slow or unreachable'));
    });

    req.write(body);
    req.end();
  });
}
