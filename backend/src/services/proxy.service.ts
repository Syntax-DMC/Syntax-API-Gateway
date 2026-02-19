import http from 'http';
import https from 'https';
import { URL } from 'url';
import { Request, Response } from 'express';

// Headers that MUST NOT be forwarded (hop-by-hop + security)
const STRIP_REQUEST_HEADERS = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'proxy-authorization',
  'proxy-connection', 'x-api-key', // never leak gateway token upstream
]);

const STRIP_RESPONSE_HEADERS = new Set([
  'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade',
]);

export interface ProxyResult {
  statusCode: number;
  responseSizeBytes: number;
  durationMs: number;
  errorMessage?: string;
}

/**
 * Streaming HTTP proxy using native Node.js http/https.
 *
 * Speed: streams request/response bodies without buffering.
 * Security: strips hop-by-hop headers, gateway tokens, and sensitive headers.
 */
export function proxyRequest(
  clientReq: Request,
  clientRes: Response,
  targetUrl: string,
  headers: Record<string, string>,
  timeoutMs = 120_000
): Promise<ProxyResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === 'https:' ? https : http;

    // Build forwarded headers: take originals, strip dangerous ones, apply overrides
    const forwardHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(clientReq.headers)) {
      const lower = key.toLowerCase();
      if (STRIP_REQUEST_HEADERS.has(lower)) continue;
      if (typeof val === 'string') {
        forwardHeaders[key] = val;
      }
    }
    // Apply caller-provided headers (auth tokens etc.) – these override originals
    Object.assign(forwardHeaders, headers);
    forwardHeaders['host'] = parsed.host;

    // If Express already parsed the body, we need to re-serialize it.
    // Never re-serialize for GET/HEAD/OPTIONS – some upstreams (SAP) misinterpret a
    // body on a GET request and ignore query-string parameters.
    const isBodyMethod = !['GET', 'HEAD', 'OPTIONS'].includes(clientReq.method || '');
    const bodyAlreadyParsed = isBodyMethod
      && clientReq.body !== undefined
      && clientReq.headers['content-type']?.includes('application/json')
      && typeof clientReq.body === 'object';

    let bodyBuf: Buffer | undefined;
    if (bodyAlreadyParsed) {
      bodyBuf = Buffer.from(JSON.stringify(clientReq.body));
      forwardHeaders['content-length'] = String(bodyBuf.length);
      // Remove chunked encoding since we know the length
      delete forwardHeaders['transfer-encoding'];
    }

    // For GET/HEAD/OPTIONS: strip content-length and content-type to ensure a clean
    // body-less request upstream (some clients send these on GET erroneously)
    if (!isBodyMethod) {
      delete forwardHeaders['content-length'];
      delete forwardHeaders['content-type'];
    }

    const reqPath = parsed.pathname + parsed.search;

    // Debug: log exact upstream request
    console.log('[proxy] upstream %s %s://%s%s | bodyParsed=%s bodyLen=%s | fwd-headers=%s',
      clientReq.method, parsed.protocol.replace(':', ''), parsed.hostname, reqPath,
      String(!!bodyAlreadyParsed), bodyBuf ? bodyBuf.length : 0,
      Object.keys(forwardHeaders).filter(k => k !== 'authorization').join(','));

    const proxyReq = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: reqPath,
        method: clientReq.method,
        headers: forwardHeaders,
        timeout: timeoutMs,
      },
      (proxyRes) => {
        const statusCode = proxyRes.statusCode || 502;
        let responseSizeBytes = 0;

        // Forward status + filtered headers
        const responseHeaders: Record<string, string | string[]> = {};
        for (const [key, val] of Object.entries(proxyRes.headers)) {
          if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
          if (val !== undefined) {
            responseHeaders[key] = val;
          }
        }

        clientRes.writeHead(statusCode, responseHeaders);

        proxyRes.on('data', (chunk: Buffer) => {
          responseSizeBytes += chunk.length;
          clientRes.write(chunk);
        });

        proxyRes.on('end', () => {
          clientRes.end();
          resolve({
            statusCode,
            responseSizeBytes,
            durationMs: Date.now() - startTime,
          });
        });

        proxyRes.on('error', (err) => {
          clientRes.end();
          resolve({
            statusCode,
            responseSizeBytes,
            durationMs: Date.now() - startTime,
            errorMessage: err.message,
          });
        });
      }
    );

    proxyReq.on('error', (err) => {
      if (!clientRes.headersSent) {
        clientRes.status(502).json({ error: 'Upstream connection failed' });
      } else {
        clientRes.end();
      }
      resolve({
        statusCode: 502,
        responseSizeBytes: 0,
        durationMs: Date.now() - startTime,
        errorMessage: err.message,
      });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!clientRes.headersSent) {
        clientRes.status(504).json({ error: 'Upstream request timed out' });
      }
      resolve({
        statusCode: 504,
        responseSizeBytes: 0,
        durationMs: Date.now() - startTime,
        errorMessage: `Timeout after ${timeoutMs}ms`,
      });
    });

    // Stream body to upstream
    if (bodyBuf) {
      proxyReq.write(bodyBuf);
      proxyReq.end();
    } else if (
      clientReq.method !== 'GET' &&
      clientReq.method !== 'HEAD' &&
      clientReq.method !== 'OPTIONS'
    ) {
      clientReq.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  });
}
