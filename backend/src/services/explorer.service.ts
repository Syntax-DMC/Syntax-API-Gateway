import http from 'http';
import https from 'https';
import { URL } from 'url';
import { connectionService } from './connection.service';
import { sapTokenService } from './sap-token.service';

const MAX_RESPONSE_BODY = 1_048_576; // 1 MB

// Same strip set as proxy.service.ts
const STRIP_REQUEST_HEADERS = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'proxy-authorization',
  'proxy-connection', 'x-api-key',
]);

const STRIP_RESPONSE_HEADERS = new Set([
  'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade',
]);

export interface ExplorerRequest {
  connectionId: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ExplorerResult {
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseSizeBytes: number;
  durationMs: number;
  errorMessage?: string;
}

class ExplorerService {
  async execute(userId: string, tenantId: string, req: ExplorerRequest): Promise<ExplorerResult> {
    // Verify ownership
    const connPublic = await connectionService.getById(req.connectionId, userId, tenantId);
    if (!connPublic) throw new Error('Connection not found');
    if (!connPublic.is_active) throw new Error('Connection not active');

    // Get raw connection for sap_base_url
    const conn = await connectionService.getRaw(req.connectionId);
    if (!conn) throw new Error('Connection not found');

    const targetUrl = `${conn.sap_base_url.replace(/\/$/, '')}${req.path}`;

    // Get SAP OAuth2 token
    const sapToken = await sapTokenService.getToken(req.connectionId);

    // Execute request
    let result = await this.doRequest(targetUrl, req, sapToken);

    // Retry once on 401 with fresh token
    if (result.statusCode === 401) {
      sapTokenService.invalidate(req.connectionId);
      const freshToken = await sapTokenService.getToken(req.connectionId);
      result = await this.doRequest(targetUrl, req, freshToken);
    }

    return result;
  }

  private doRequest(
    targetUrl: string,
    req: ExplorerRequest,
    sapToken: string
  ): Promise<ExplorerResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const parsed = new URL(targetUrl);
      const transport = parsed.protocol === 'https:' ? https : http;

      // Build headers: user-provided + SAP bearer override
      const headers: Record<string, string> = {};
      if (req.headers) {
        for (const [key, val] of Object.entries(req.headers)) {
          if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
            headers[key] = val;
          }
        }
      }
      headers['Authorization'] = `Bearer ${sapToken}`;
      headers['host'] = parsed.host;

      // Body handling
      let bodyBuf: Buffer | undefined;
      if (req.body && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        bodyBuf = Buffer.from(req.body);
        headers['content-length'] = String(bodyBuf.length);
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
      }

      const proxyReq = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: req.method,
          headers,
          timeout: 30_000,
        },
        (proxyRes) => {
          const statusCode = proxyRes.statusCode || 502;
          const chunks: Buffer[] = [];
          let totalSize = 0;
          let truncated = false;

          // Collect response headers
          const responseHeaders: Record<string, string> = {};
          for (const [key, val] of Object.entries(proxyRes.headers)) {
            if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
            if (typeof val === 'string') {
              responseHeaders[key] = val;
            } else if (Array.isArray(val)) {
              responseHeaders[key] = val.join(', ');
            }
          }

          proxyRes.on('data', (chunk: Buffer) => {
            totalSize += chunk.length;
            if (!truncated && totalSize <= MAX_RESPONSE_BODY) {
              chunks.push(chunk);
            } else {
              truncated = true;
            }
          });

          proxyRes.on('end', () => {
            let responseBody = Buffer.concat(chunks).toString('utf8');
            if (truncated) {
              responseBody += '\n...[truncated at 1MB]';
            }
            resolve({
              statusCode,
              responseHeaders,
              responseBody: responseBody || null,
              responseSizeBytes: totalSize,
              durationMs: Date.now() - startTime,
            });
          });

          proxyRes.on('error', (err) => {
            resolve({
              statusCode,
              responseHeaders,
              responseBody: null,
              responseSizeBytes: totalSize,
              durationMs: Date.now() - startTime,
              errorMessage: err.message,
            });
          });
        }
      );

      proxyReq.on('error', (err) => {
        resolve({
          statusCode: 502,
          responseHeaders: {},
          responseBody: null,
          responseSizeBytes: 0,
          durationMs: Date.now() - startTime,
          errorMessage: `Upstream connection failed: ${err.message}`,
        });
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        resolve({
          statusCode: 504,
          responseHeaders: {},
          responseBody: null,
          responseSizeBytes: 0,
          durationMs: Date.now() - startTime,
          errorMessage: 'Upstream request timed out (30s)',
        });
      });

      if (bodyBuf) {
        proxyReq.write(bodyBuf);
      }
      proxyReq.end();
    });
  }
}

export const explorerService = new ExplorerService();
