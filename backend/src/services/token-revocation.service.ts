/**
 * In-memory JWT revocation set.
 * Stores revoked JTIs (JWT IDs) until their natural expiry.
 * Periodically cleans up expired entries to prevent memory growth.
 */

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class TokenRevocationService {
  // Map of jti → expiry timestamp (ms)
  private revoked = new Map<string, number>();

  constructor() {
    setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  /** Revoke a token by its JTI. expiresAt is the token's exp in seconds (from JWT). */
  revoke(jti: string, expiresAtSec: number): void {
    this.revoked.set(jti, expiresAtSec * 1000);
  }

  /** Check if a JTI has been revoked. */
  isRevoked(jti: string): boolean {
    return this.revoked.has(jti);
  }

  /** Remove expired entries from the set. */
  private cleanup(): void {
    const now = Date.now();
    for (const [jti, expiresAt] of this.revoked) {
      if (expiresAt <= now) {
        this.revoked.delete(jti);
      }
    }
  }
}

export const tokenRevocationService = new TokenRevocationService();
