/**
 * Tests for H-1: CORS Localhost Bypass
 * Verifies that localhost origins are only allowed in development mode,
 * not in production.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockReqRes(origin: string | undefined, path: string) {
  const req: any = {
    headers: origin ? { origin } : {},
    path,
    method: 'GET',
  };
  const res: any = {
    statusCode: 200,
    _headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this._headers[name.toLowerCase()] = value; },
    getHeader(name: string) { return this._headers[name.toLowerCase()]; },
    status(code: number) { this.statusCode = code; return this; },
    end: vi.fn(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('H-1: CORS - Production mode', () => {
  let corsMiddleware: typeof import('../middleware/cors')['corsMiddleware'];

  beforeEach(async () => {
    vi.resetModules();
    // Mock config as production
    vi.doMock('../config', () => ({
      config: {
        nodeEnv: 'production',
        allowedOrigins: ['https://my-app.example.com'],
      },
    }));
    const mod = await import('../middleware/cors');
    corsMiddleware = mod.corsMiddleware;
  });

  it('does NOT set CORS headers for localhost origin on /gw/ routes in production', () => {
    const { req, res, next } = createMockReqRes('http://localhost:5173', '/gw/dm/api');
    corsMiddleware(req, res, next);

    expect(res._headers['access-control-allow-origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('does NOT set CORS headers for 127.0.0.1 origin on /gw/ routes in production', () => {
    const { req, res, next } = createMockReqRes('http://127.0.0.1:3000', '/gw/dm/api');
    corsMiddleware(req, res, next);

    expect(res._headers['access-control-allow-origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('sets CORS headers for configured allowed origin in production', () => {
    const { req, res, next } = createMockReqRes('https://my-app.example.com', '/gw/dm/api');
    corsMiddleware(req, res, next);

    expect(res._headers['access-control-allow-origin']).toBe('https://my-app.example.com');
    expect(next).toHaveBeenCalled();
  });

  it('does NOT set CORS headers for unknown origin in production', () => {
    const { req, res, next } = createMockReqRes('https://evil.com', '/gw/dm/api');
    corsMiddleware(req, res, next);

    expect(res._headers['access-control-allow-origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('does NOT set CORS headers on /api/* routes (same-origin only)', () => {
    const { req, res, next } = createMockReqRes('https://my-app.example.com', '/api/connections');
    corsMiddleware(req, res, next);

    expect(res._headers['access-control-allow-origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('H-1: CORS - Development mode', () => {
  let corsMiddleware: typeof import('../middleware/cors')['corsMiddleware'];

  beforeEach(async () => {
    vi.resetModules();
    // Mock config as development
    vi.doMock('../config', () => ({
      config: {
        nodeEnv: 'development',
        allowedOrigins: ['http://localhost:5173'],
      },
    }));
    const mod = await import('../middleware/cors');
    corsMiddleware = mod.corsMiddleware;
  });

  it('allows localhost origin on /gw/ routes in development', () => {
    const { req, res, next } = createMockReqRes('http://localhost:5173', '/gw/dm/api');
    corsMiddleware(req, res, next);

    expect(res._headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(next).toHaveBeenCalled();
  });

  it('allows any localhost port in development', () => {
    const { req, res, next } = createMockReqRes('http://localhost:9999', '/gw/dm/api');
    corsMiddleware(req, res, next);

    expect(res._headers['access-control-allow-origin']).toBe('http://localhost:9999');
    expect(next).toHaveBeenCalled();
  });

  it('allows 127.0.0.1 in development', () => {
    const { req, res, next } = createMockReqRes('http://127.0.0.1:3000', '/gw/health');
    corsMiddleware(req, res, next);

    expect(res._headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
    expect(next).toHaveBeenCalled();
  });
});
