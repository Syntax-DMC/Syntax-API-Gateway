/**
 * Tests for H-2 (Security Headers) and H-5 (Middleware Ordering)
 * Uses source-level verification to confirm structural security fixes.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.join(SRC, relativePath), 'utf8');
}

describe('H-2: Security Headers (Helmet)', () => {
  const indexSrc = readSrc('index.ts');

  it('imports helmet', () => {
    expect(indexSrc).toContain("import helmet from 'helmet'");
  });

  it('applies helmet middleware with CSP', () => {
    expect(indexSrc).toContain('app.use(helmet(');
    expect(indexSrc).toContain('contentSecurityPolicy');
  });

  it('configures HSTS', () => {
    expect(indexSrc).toContain('hsts');
    expect(indexSrc).toContain('maxAge');
  });

  it('helmet is applied before CORS middleware', () => {
    const helmetPos = indexSrc.indexOf('app.use(helmet(');
    const corsPos = indexSrc.indexOf('app.use(corsMiddleware)');
    expect(helmetPos).toBeGreaterThan(-1);
    expect(corsPos).toBeGreaterThan(-1);
    expect(helmetPos).toBeLessThan(corsPos);
  });

  it('health endpoint does NOT leak uptime', () => {
    // Find the health endpoint handler
    const healthMatch = indexSrc.match(/app\.get\('\/gw\/health'[\s\S]*?\}\)/);
    expect(healthMatch).not.toBeNull();
    const healthHandler = healthMatch![0];
    expect(healthHandler).not.toContain('uptime');
    expect(healthHandler).toContain("status: 'healthy'");
  });
});

describe('H-5: Proxy Middleware Ordering (Auth before Logger)', () => {
  it('proxy-dm: tokenAuthMiddleware runs before requestLogger', () => {
    const src = readSrc('routes/proxy-dm.routes.ts');

    // Find the middleware chain in the router.all() call
    const tokenAuthPos = src.indexOf('tokenAuthMiddleware');
    const requestLoggerPos = src.indexOf("requestLogger('sap_dm')");

    expect(tokenAuthPos).toBeGreaterThan(-1);
    expect(requestLoggerPos).toBeGreaterThan(-1);
    expect(tokenAuthPos).toBeLessThan(requestLoggerPos);
  });

  it('proxy-agent: tokenAuthMiddleware runs before requestLogger', () => {
    const src = readSrc('routes/proxy-agent.routes.ts');

    const tokenAuthPos = src.indexOf('tokenAuthMiddleware');
    const requestLoggerPos = src.indexOf("requestLogger('agent')");

    expect(tokenAuthPos).toBeGreaterThan(-1);
    expect(requestLoggerPos).toBeGreaterThan(-1);
    expect(tokenAuthPos).toBeLessThan(requestLoggerPos);
  });

  it('proxy-dm: middleware chain order is proxyLimiter → tokenAuth → requestLogger', () => {
    const src = readSrc('routes/proxy-dm.routes.ts');
    // Extract just the router.all() middleware chain (after the route pattern)
    const routerCall = src.substring(src.indexOf("router.all("));
    const limiterPos = routerCall.indexOf('proxyLimiter');
    const tokenAuthPos = routerCall.indexOf('tokenAuthMiddleware');
    const loggerPos = routerCall.indexOf("requestLogger(");

    expect(limiterPos).toBeGreaterThan(-1);
    expect(limiterPos).toBeLessThan(tokenAuthPos);
    expect(tokenAuthPos).toBeLessThan(loggerPos);
  });

  it('proxy-agent: middleware chain order is proxyLimiter → tokenAuth → requestLogger', () => {
    const src = readSrc('routes/proxy-agent.routes.ts');
    const routerCall = src.substring(src.indexOf("router.post("));
    const limiterPos = routerCall.indexOf('proxyLimiter');
    const tokenAuthPos = routerCall.indexOf('tokenAuthMiddleware');
    const loggerPos = routerCall.indexOf("requestLogger(");

    expect(limiterPos).toBeGreaterThan(-1);
    expect(limiterPos).toBeLessThan(tokenAuthPos);
    expect(tokenAuthPos).toBeLessThan(loggerPos);
  });
});

describe('C-1: URL Validation Applied to Connection Routes', () => {
  const connSrc = readSrc('routes/connections.routes.ts');

  it('imports validateUpstreamUrlDns', () => {
    expect(connSrc).toContain('validateUpstreamUrlDns');
  });

  it('validates URLs on POST (create) before calling connectionService.create', () => {
    const validatePos = connSrc.indexOf('validateUpstreamUrlDns');
    const createPos = connSrc.indexOf('connectionService.create');
    expect(validatePos).toBeGreaterThan(-1);
    expect(createPos).toBeGreaterThan(-1);
    expect(validatePos).toBeLessThan(createPos);
  });

  it('validates URLs on PATCH (update) before calling connectionService.update', () => {
    // Find the second occurrence of validateUpstreamUrlDns (in PATCH handler)
    const firstPos = connSrc.indexOf('validateUpstreamUrlDns');
    const secondPos = connSrc.indexOf('validateUpstreamUrlDns', firstPos + 1);
    const updatePos = connSrc.indexOf('connectionService.update');

    expect(secondPos).toBeGreaterThan(-1);
    expect(updatePos).toBeGreaterThan(-1);
    expect(secondPos).toBeLessThan(updatePos);
  });

  it('validates sapBaseUrl, tokenUrl, and agentApiUrl', () => {
    // Check that all three URL fields are validated
    expect(connSrc).toContain("'sapBaseUrl'");
    expect(connSrc).toContain("'tokenUrl'");
    expect(connSrc).toContain("'agentApiUrl'");
  });
});

describe('C-3: JWT Revocation Integration', () => {
  const authMiddlewareSrc = readSrc('middleware/auth.ts');
  const authRoutesSrc = readSrc('routes/auth.routes.ts');
  const authServiceSrc = readSrc('services/auth.service.ts');

  it('auth middleware imports tokenRevocationService', () => {
    expect(authMiddlewareSrc).toContain('tokenRevocationService');
  });

  it('auth middleware checks isRevoked', () => {
    expect(authMiddlewareSrc).toContain('isRevoked');
  });

  it('logout route revokes the access token', () => {
    expect(authRoutesSrc).toContain('tokenRevocationService.revoke');
  });

  it('auth service generates JTI on login tokens', () => {
    expect(authServiceSrc).toContain('jti: uuidv4()');
  });

  it('auth service imports uuid', () => {
    expect(authServiceSrc).toContain("import { v4 as uuidv4 }");
  });
});
