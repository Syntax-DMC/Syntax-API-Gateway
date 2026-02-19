/**
 * Tests for C-3: JWT Revocation Mechanism
 * Verifies the in-memory token revocation service correctly
 * tracks revoked JTIs and cleans up expired entries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need a fresh instance for each test, so we dynamically import
// But first, mock the setInterval to prevent real timers
vi.useFakeTimers();

describe('C-3: Token Revocation Service', () => {
  let tokenRevocationService: typeof import('../services/token-revocation.service')['tokenRevocationService'];

  beforeEach(async () => {
    // Clear module cache to get a fresh instance each test
    vi.resetModules();
    const mod = await import('../services/token-revocation.service');
    tokenRevocationService = mod.tokenRevocationService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports non-revoked token as not revoked', () => {
    expect(tokenRevocationService.isRevoked('random-jti')).toBe(false);
  });

  it('revokes a token and reports it as revoked', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    tokenRevocationService.revoke('test-jti-1', futureExp);
    expect(tokenRevocationService.isRevoked('test-jti-1')).toBe(true);
  });

  it('different JTI remains unrevoked', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    tokenRevocationService.revoke('test-jti-1', futureExp);
    expect(tokenRevocationService.isRevoked('test-jti-2')).toBe(false);
  });

  it('can revoke multiple tokens', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    tokenRevocationService.revoke('jti-a', futureExp);
    tokenRevocationService.revoke('jti-b', futureExp);
    tokenRevocationService.revoke('jti-c', futureExp);
    expect(tokenRevocationService.isRevoked('jti-a')).toBe(true);
    expect(tokenRevocationService.isRevoked('jti-b')).toBe(true);
    expect(tokenRevocationService.isRevoked('jti-c')).toBe(true);
  });

  it('cleans up expired entries after cleanup interval', () => {
    // Revoke a token that expires "1 second from now"
    const nearExp = Math.floor(Date.now() / 1000) + 1;
    tokenRevocationService.revoke('expiring-jti', nearExp);
    expect(tokenRevocationService.isRevoked('expiring-jti')).toBe(true);

    // Advance time past the expiry AND past the cleanup interval (5 min)
    vi.advanceTimersByTime(5 * 60 * 1000 + 2000);

    // After cleanup, the expired entry should be removed
    expect(tokenRevocationService.isRevoked('expiring-jti')).toBe(false);
  });

  it('retains non-expired entries after cleanup', () => {
    const longExp = Math.floor(Date.now() / 1000) + 86400; // 24 hours
    tokenRevocationService.revoke('long-lived-jti', longExp);

    // Advance time past the cleanup interval
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    // Still revoked — hasn't expired
    expect(tokenRevocationService.isRevoked('long-lived-jti')).toBe(true);
  });
});
