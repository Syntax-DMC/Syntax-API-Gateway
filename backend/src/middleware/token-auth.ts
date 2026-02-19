import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { pool } from '../db/pool';
import { TokenAuthenticatedRequest } from '../types';

interface TokenConnectionRow {
  token_id: string;
  user_id: string;
  token_tenant_id: string;
  sap_connection_id: string;
  token_hash: string;
  token_prefix: string;
  label: string;
  token_active: boolean;
  last_used_at: Date | null;
  request_count: number;
  token_created_at: Date;
  expires_at: Date | null;
  connection_id: string;
  conn_user_id: string;
  conn_tenant_id: string;
  name: string;
  sap_base_url: string;
  token_url: string;
  client_id: string;
  client_secret_enc: string;
  agent_api_url: string | null;
  agent_api_key_enc: string | null;
  conn_active: boolean;
}

/**
 * Token-auth middleware for /gw/* proxy routes.
 * Validates x-api-key header, loads token + connection, attaches to request.
 *
 * Speed: single JOIN query instead of two round-trips.
 * Security: hash comparison in SQL, token usage recorded fire-and-forget.
 */
export async function tokenAuthMiddleware(
  req: TokenAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'Missing x-api-key header' });
    return;
  }

  // Validate format before hitting DB
  if (!apiKey.startsWith('sdmg_') || apiKey.length !== 45) {
    res.status(401).json({ error: 'Invalid API key format' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  try {
    const { rows } = await pool.query<TokenConnectionRow>(
      `SELECT
         t.id AS token_id, t.user_id, t.tenant_id AS token_tenant_id,
         t.sap_connection_id, t.token_hash,
         t.token_prefix, t.label, t.is_active AS token_active,
         t.last_used_at, t.request_count, t.created_at AS token_created_at,
         t.expires_at,
         c.id AS connection_id, c.user_id AS conn_user_id, c.tenant_id AS conn_tenant_id,
         c.name, c.sap_base_url,
         c.token_url, c.client_id, c.client_secret_enc,
         c.agent_api_url, c.agent_api_key_enc,
         c.is_active AS conn_active
       FROM api_tokens t
       JOIN sap_connections c ON c.id = t.sap_connection_id
       WHERE t.token_hash = $1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    const row = rows[0];

    if (!row.token_active) {
      res.status(401).json({ error: 'API key is deactivated' });
      return;
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      res.status(401).json({ error: 'API key has expired' });
      return;
    }

    if (!row.conn_active) {
      res.status(403).json({ error: 'Associated connection is deactivated' });
      return;
    }

    req.apiToken = {
      id: row.token_id,
      user_id: row.user_id,
      tenant_id: row.token_tenant_id,
      sap_connection_id: row.sap_connection_id,
      token_hash: row.token_hash,
      token_prefix: row.token_prefix,
      label: row.label,
      is_active: true,
      last_used_at: row.last_used_at,
      request_count: row.request_count,
      created_at: row.token_created_at,
      expires_at: row.expires_at,
    };

    req.sapConnection = {
      id: row.connection_id,
      user_id: row.conn_user_id,
      tenant_id: row.conn_tenant_id,
      name: row.name,
      sap_base_url: row.sap_base_url,
      token_url: row.token_url,
      client_id: row.client_id,
      client_secret_enc: row.client_secret_enc,
      agent_api_url: row.agent_api_url,
      agent_api_key_enc: row.agent_api_key_enc,
      is_active: true,
      created_at: row.token_created_at,
      updated_at: row.token_created_at,
    };

    // Fire-and-forget: record usage without blocking the response
    pool.query(
      'UPDATE api_tokens SET last_used_at = now(), request_count = request_count + 1 WHERE id = $1',
      [row.token_id]
    ).catch(() => {});

    next();
  } catch (err) {
    console.error('Token auth error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
