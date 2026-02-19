import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { tokenRevocationService } from '../services/token-revocation.service';
import { AuthenticatedRequest, JwtPayload } from '../types';

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload & { type?: string; jti?: string; exp?: number };

    // Reject refresh tokens used as access tokens
    if (decoded.type === 'refresh') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }

    // Check if token has been revoked
    if (decoded.jti && tokenRevocationService.isRevoked(decoded.jti)) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      isSuperadmin: decoded.isSuperadmin,
      activeTenantId: decoded.activeTenantId,
      activeTenantRole: decoded.activeTenantRole,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireSuperadmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || !req.user.isSuperadmin) {
    res.status(403).json({ error: 'Superadmin access required' });
    return;
  }
  next();
}

export function requireTenantAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || (!req.user.isSuperadmin && req.user.activeTenantRole !== 'admin')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireActiveTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || !req.user.activeTenantId) {
    res.status(403).json({ error: 'No active tenant selected' });
    return;
  }
  next();
}
