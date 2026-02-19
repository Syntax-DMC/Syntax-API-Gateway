import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { config } from '../config';
import { TokenAuthenticatedRequest } from '../types';

/**
 * Rate limiters by route category.
 *
 * Security: prevents brute-force, abuse, and DoS.
 * Speed: in-memory store (no Redis round-trip).
 */

// Login: 5 attempts per minute per IP
export const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: config.rateLimitLogin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
  message: { error: 'Too many login attempts, try again in 1 minute' },
});

// Proxy /gw/*: 100 requests per minute per API token
export const proxyLimiter = rateLimit({
  windowMs: 60_000,
  max: config.rateLimitProxy,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use token prefix as key (available after token-auth middleware)
    const tokenReq = req as TokenAuthenticatedRequest;
    return tokenReq.apiToken?.id || req.ip || 'unknown';
  },
  message: { error: 'Rate limit exceeded for this API token' },
});

// API /api/*: 30 requests per minute per user (by JWT userId or IP)
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: config.rateLimitApi,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Try to extract userId from Authorization header without full JWT verify
    // (the real auth middleware runs after this, so fall back to IP)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Use the token itself as key — unique per user session
      return authHeader.substring(7, 47); // first 40 chars is enough for uniqueness
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  message: { error: 'Rate limit exceeded, try again in 1 minute' },
});
