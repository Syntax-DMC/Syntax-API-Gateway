import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

const isDev = config.nodeEnv === 'development';

/**
 * CORS middleware with split behaviour:
 * - /gw/* routes: dynamic origins from config + localhost:*
 * - /api/* routes: same-origin only (frontend served from same host)
 *
 * Security: strict origin validation, no wildcard, credentials allowed.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (!origin) {
    next();
    return;
  }

  const isGatewayRoute = req.path.startsWith('/gw/');

  if (isGatewayRoute) {
    // Allow configured origins + any localhost port
    if (isAllowedOrigin(origin)) {
      setCorsHeaders(res, origin);
    }
  }
  // /api/* routes: same-origin — no CORS headers needed

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

function isAllowedOrigin(origin: string): boolean {
  // Exact match against configured origins
  if (config.allowedOrigins.includes(origin)) {
    return true;
  }

  // Allow any localhost port in development only
  if (isDev) {
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

function setCorsHeaders(res: Response, origin: string): void {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '3600');
  res.setHeader('Vary', 'Origin');
}
