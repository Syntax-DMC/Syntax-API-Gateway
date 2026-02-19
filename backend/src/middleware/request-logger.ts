import { Response, NextFunction } from 'express';
import { pool } from '../db/pool';
import { TokenAuthenticatedRequest } from '../types';

// Max body size to store (64 KB) — prevents huge payloads bloating DB
const MAX_BODY_SIZE = 64 * 1024;

/**
 * Async request logger for /gw/* proxy routes.
 *
 * Speed: fire-and-forget DB write, never blocks response.
 * Security: NEVER logs Authorization, x-api-key headers.
 * Bodies are truncated at 64 KB.
 */
export function requestLogger(target: 'agent' | 'sap_dm') {
  return (req: TokenAuthenticatedRequest, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Capture request body (already parsed by Express json() middleware)
    let requestBody: string | null = null;
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      try {
        const bodyStr = JSON.stringify(req.body);
        requestBody = bodyStr.length <= MAX_BODY_SIZE ? bodyStr : bodyStr.substring(0, MAX_BODY_SIZE) + '...[truncated]';
      } catch {
        requestBody = null;
      }
    }

    // Accumulate response body chunks
    const responseChunks: Buffer[] = [];
    let responseSize = 0;
    let capturedResponseHeaders: Record<string, string> | null = null;

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const originalWriteHead = res.writeHead.bind(res);

    // Intercept writeHead to capture response headers
    (res as any).writeHead = function (statusCode: number, ...args: any[]) {
      // writeHead may be called as (code, headers) or (code, statusMessage, headers)
      return originalWriteHead(statusCode, ...args);
    };

    // Track response body via write
    (res as any).write = function (chunk: any, ...args: any[]) {
      if (chunk) {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        responseSize += buf.length;
        if (responseSize <= MAX_BODY_SIZE) {
          responseChunks.push(buf);
        }
      }
      return originalWrite(chunk, ...args);
    };

    (res as any).end = function (chunk: any, ...args: any[]) {
      if (chunk) {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        responseSize += buf.length;
        if (responseSize <= MAX_BODY_SIZE) {
          responseChunks.push(buf);
        }
      }

      // Capture response headers (after they've been set)
      const rawHeaders = res.getHeaders();
      capturedResponseHeaders = filterHeaders(rawHeaders as Record<string, any>);

      // Build response body string
      let responseBody: string | null = null;
      if (responseChunks.length > 0) {
        try {
          const full = Buffer.concat(responseChunks).toString('utf8');
          responseBody = full.length <= MAX_BODY_SIZE ? full : full.substring(0, MAX_BODY_SIZE) + '...[truncated]';
        } catch {
          responseBody = null;
        }
      }
      if (responseSize > MAX_BODY_SIZE && responseBody) {
        responseBody = responseBody + '...[truncated]';
      }

      // Fire-and-forget: write log after response is sent
      const durationMs = Date.now() - startTime;
      const requestBodySize = req.headers['content-length']
        ? parseInt(req.headers['content-length'], 10)
        : 0;

      // Safe headers: strip all sensitive values
      const safeHeaders = filterHeaders(req.headers);

      writeLog({
        apiTokenId: req.apiToken?.id || null,
        sapConnectionId: req.sapConnection?.id || null,
        target,
        method: req.method,
        path: req.originalUrl,
        requestHeaders: safeHeaders,
        requestBodySize,
        requestBody,
        statusCode: res.statusCode,
        responseBodySize: responseSize,
        responseHeaders: capturedResponseHeaders,
        responseBody,
        durationMs,
        errorMessage: res.statusCode >= 500 ? `HTTP ${res.statusCode}` : null,
      });

      return originalEnd(chunk, ...args);
    };

    next();
  };
}

// Headers that are NEVER logged
const REDACTED_HEADERS = new Set([
  'authorization', 'x-api-key', 'cookie', 'set-cookie',
  'x-csrf-token', 'x-xsrf-token',
]);

function filterHeaders(headers: Record<string, any>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (REDACTED_HEADERS.has(key.toLowerCase())) continue;
    if (typeof val === 'string') {
      safe[key] = val;
    } else if (typeof val === 'number') {
      safe[key] = String(val);
    }
  }
  return safe;
}

interface LogEntry {
  apiTokenId: string | null;
  sapConnectionId: string | null;
  target: 'agent' | 'sap_dm';
  method: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBodySize: number;
  requestBody: string | null;
  statusCode: number;
  responseBodySize: number;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  durationMs: number;
  errorMessage: string | null;
}

/** Strip PostgreSQL-invalid null bytes (\x00) from strings */
function sanitize(val: string | null): string | null {
  return val ? val.replace(/\x00/g, '') : val;
}

function writeLog(entry: LogEntry): void {
  pool.query(
    `INSERT INTO request_logs
      (api_token_id, sap_connection_id, direction, target, method, path,
       request_headers, request_body_size, request_body,
       status_code, response_body_size, response_headers, response_body,
       duration_ms, error_message)
     VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      entry.apiTokenId,
      entry.sapConnectionId,
      entry.target,
      entry.method,
      entry.path.substring(0, 500), // truncate long paths
      sanitize(JSON.stringify(entry.requestHeaders)),
      entry.requestBodySize,
      sanitize(entry.requestBody),
      entry.statusCode,
      entry.responseBodySize,
      entry.responseHeaders ? sanitize(JSON.stringify(entry.responseHeaders)) : null,
      sanitize(entry.responseBody),
      entry.durationMs,
      entry.errorMessage,
    ]
  ).catch((err) => {
    console.error('Log write failed:', err.message);
  });
}
