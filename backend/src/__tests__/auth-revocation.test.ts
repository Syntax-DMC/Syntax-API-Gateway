/**
 * Tests for C-3: Auth middleware rejects revoked JWTs
 * Verifies the auth middleware checks the revocation service
 * and rejects tokens whose JTI has been revoked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt, { SignOptions } from 'jsonwebtoken';

const TEST_SECRET = 'test-jwt-secret-for-unit-tests';

// Mock config
vi.mock('../config', () => ({
  config: {
    jwtSecret: 'test-jwt-secret-for-unit-tests',
    nodeEnv: 'test',
  },
}));

// We need a real token-revocation service for integration testing
// but we want to control it. Let's use the real one but mock the timer.
vi.useFakeTimers();

import { authMiddleware } from '../middleware/auth';
import { tokenRevocationService } from '../services/token-revocation.service';

function createMockReqRes(token?: string) {
  const req: any = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const res: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

function signToken(payload: Record<string, unknown>, expiresIn = '15m'): string {
  return jwt.sign(payload, TEST_SECRET, { expiresIn } as SignOptions);
}

describe('C-3: Auth middleware - JWT revocation check', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows valid non-revoked token with jti', () => {
    const token = signToken({
      userId: 'u1', username: 'test', isSuperadmin: false,
      activeTenantId: 't1', activeTenantRole: 'user',
      jti: 'valid-jti-123',
    });

    const { req, res, next } = createMockReqRes(token);
    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe('u1');
  });

  it('rejects a revoked token', () => {
    const jti = 'revoked-jti-456';
    const futureExp = Math.floor(Date.now() / 1000) + 900; // 15 min

    // Revoke the JTI
    tokenRevocationService.revoke(jti, futureExp);

    const token = signToken({
      userId: 'u1', username: 'test', isSuperadmin: false,
      activeTenantId: 't1', activeTenantRole: 'user',
      jti,
    });

    const { req, res, next } = createMockReqRes(token);
    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token has been revoked' });
  });

  it('still rejects refresh tokens used as access tokens', () => {
    const token = signToken({
      userId: 'u1', username: 'test', isSuperadmin: false,
      activeTenantId: 't1', activeTenantRole: 'user',
      type: 'refresh', jti: 'some-jti',
    });

    const { req, res, next } = createMockReqRes(token);
    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token type' });
  });

  it('rejects missing authorization header', () => {
    const { req, res, next } = createMockReqRes();
    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects expired tokens', () => {
    const token = signToken({
      userId: 'u1', username: 'test', isSuperadmin: false,
      activeTenantId: 't1', activeTenantRole: 'user',
      jti: 'expired-jti',
    }, '0s'); // expires immediately

    // Small delay to ensure expiry
    vi.advanceTimersByTime(1000);

    const { req, res, next } = createMockReqRes(token);
    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('allows tokens without jti (backward compat) if not revoked', () => {
    const token = signToken({
      userId: 'u1', username: 'test', isSuperadmin: false,
      activeTenantId: 't1', activeTenantRole: 'user',
      // no jti
    });

    const { req, res, next } = createMockReqRes(token);
    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
  });
});
