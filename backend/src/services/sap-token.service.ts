import https from 'https';
import http from 'http';
import { URL } from 'url';
import { cryptoService } from './crypto.service';
import { connectionService } from './connection.service';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const EXPIRY_BUFFER_MS = 120_000; // refresh 2 min before expiry

/**
 * SAP OAuth2 Token Manager with in-memory caching.
 *
 * Speed: tokens cached per connection, only re-fetched when near expiry.
 * Security: client_secret decrypted on demand, never held in cache.
 */
class SapTokenService {
  private cache = new Map<string, CachedToken>();

  async getToken(connectionId: string): Promise<string> {
    const cached = this.cache.get(connectionId);
    if (cached && cached.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
      return cached.accessToken;
    }

    // Fetch connection and decrypt secret
    const conn = await connectionService.getRaw(connectionId);
    if (!conn) throw new Error(`Connection ${connectionId} not found`);

    const clientSecret = await cryptoService.decrypt(conn.client_secret_enc);
    const tokenData = await this.fetchOAuthToken(conn.token_url, conn.client_id, clientSecret);

    this.cache.set(connectionId, {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    });

    return tokenData.access_token;
  }

  invalidate(connectionId: string): void {
    this.cache.delete(connectionId);
  }

  private fetchOAuthToken(
    tokenUrl: string,
    clientId: string,
    clientSecret: string
  ): Promise<{ access_token: string; expires_in: number }> {
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
              reject(new Error(`SAP token request failed (${res.statusCode}): ${raw.substring(0, 200)}`));
              return;
            }
            try {
              const data = JSON.parse(raw);
              if (!data.access_token) {
                reject(new Error('SAP token response missing access_token'));
                return;
              }
              resolve({
                access_token: data.access_token,
                expires_in: data.expires_in || 3600,
              });
            } catch {
              reject(new Error('Invalid JSON in SAP token response'));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('SAP token request timed out (10s)'));
      });

      req.write(body);
      req.end();
    });
  }
}

export const sapTokenService = new SapTokenService();
