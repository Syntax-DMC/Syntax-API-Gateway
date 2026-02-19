import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authService, AuthError } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';
import { tokenRevocationService } from '../services/token-revocation.service';
import { config } from '../config';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const result = await authService.login(username, password);
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error('Login error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const result = await authService.refresh(refreshToken);
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(401).json({ error: err.message });
      return;
    }
    console.error('Refresh error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  // Revoke the access token
  const token = req.headers.authorization?.slice(7);
  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret, { ignoreExpiration: true }) as { jti?: string; exp?: number };
      if (decoded.jti && decoded.exp) {
        tokenRevocationService.revoke(decoded.jti, decoded.exp);
      }
    } catch {
      // Token already invalid — nothing to revoke
    }
  }

  // Also revoke the refresh token if provided
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, config.jwtSecret, { ignoreExpiration: true }) as { jti?: string; exp?: number };
      if (decoded.jti && decoded.exp) {
        tokenRevocationService.revoke(decoded.jti, decoded.exp);
      }
    } catch {
      // Invalid refresh token — ignore
    }
  }

  res.json({ message: 'Logged out successfully' });
});

router.post('/switch-tenant', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.body;

    if (!tenantId) {
      res.status(400).json({ error: 'tenantId is required' });
      return;
    }

    const result = await authService.switchTenant(req.user!.userId, tenantId);
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(403).json({ error: err.message });
      return;
    }
    console.error('Switch tenant error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/memberships', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const memberships = await authService.getMemberships(req.user!.userId);
    res.json(memberships);
  } catch (err) {
    console.error('Get memberships error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
