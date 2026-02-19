import crypto from 'crypto';
import { pool } from '../db/pool';
import { ApiToken } from '../types';

const TOKEN_PREFIX = 'sdmg_';
const TOKEN_RANDOM_BYTES = 20; // 20 bytes = 40 hex chars

type TokenPublic = Omit<ApiToken, 'token_hash'> & {
  connection_name?: string;
};

function toPublic(row: ApiToken & { connection_name?: string }): TokenPublic {
  const { token_hash: _, ...rest } = row;
  return rest;
}

class ApiTokenService {
  async listByUserAndTenant(userId: string, tenantId: string): Promise<TokenPublic[]> {
    const { rows } = await pool.query<ApiToken & { connection_name: string }>(
      `SELECT t.*, c.name AS connection_name
       FROM api_tokens t
       JOIN sap_connections c ON c.id = t.sap_connection_id
       WHERE t.user_id = $1 AND t.tenant_id = $2
       ORDER BY t.created_at DESC`,
      [userId, tenantId]
    );
    return rows.map(toPublic);
  }

  async create(
    userId: string,
    tenantId: string,
    data: { sapConnectionId: string; label: string; expiresAt?: string }
  ): Promise<{ token: string; tokenData: TokenPublic }> {
    // Verify user owns the connection in this tenant
    const { rows: connRows } = await pool.query(
      'SELECT id FROM sap_connections WHERE id = $1 AND user_id = $2 AND tenant_id = $3',
      [data.sapConnectionId, userId, tenantId]
    );
    if (connRows.length === 0) {
      throw new Error('Connection not found');
    }

    // Generate token
    const randomHex = crypto.randomBytes(TOKEN_RANDOM_BYTES).toString('hex');
    const plainToken = `${TOKEN_PREFIX}${randomHex}`;
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const tokenPrefix = plainToken.substring(0, 12); // "sdmg_" + 7 chars

    const { rows } = await pool.query<ApiToken>(
      `INSERT INTO api_tokens (user_id, tenant_id, sap_connection_id, token_hash, token_prefix, label, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        tenantId,
        data.sapConnectionId,
        tokenHash,
        tokenPrefix,
        data.label,
        data.expiresAt || null,
      ]
    );

    return {
      token: plainToken,
      tokenData: toPublic(rows[0]),
    };
  }

  async update(
    id: string,
    userId: string,
    data: { label?: string; is_active?: boolean },
    tenantId?: string
  ): Promise<TokenPublic | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.label !== undefined) {
      fields.push(`label = $${idx++}`);
      values.push(data.label);
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(data.is_active);
    }

    if (fields.length === 0) return null;

    values.push(id, userId);
    let query = `UPDATE api_tokens SET ${fields.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx++}`;

    if (tenantId) {
      query += ` AND tenant_id = $${idx}`;
      values.push(tenantId);
    }

    query += ' RETURNING *';

    const { rows } = await pool.query<ApiToken>(query, values);
    return rows.length > 0 ? toPublic(rows[0]) : null;
  }

  async delete(id: string, userId: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM api_tokens WHERE id = $1 AND user_id = $2';
    const params: unknown[] = [id, userId];
    if (tenantId) {
      query += ' AND tenant_id = $3';
      params.push(tenantId);
    }
    const { rowCount } = await pool.query(query, params);
    return (rowCount ?? 0) > 0;
  }

  async findByHash(tokenHash: string): Promise<(ApiToken & { connection_name?: string }) | null> {
    const { rows } = await pool.query<ApiToken>(
      `SELECT * FROM api_tokens
       WHERE token_hash = $1 AND is_active = true
         AND (expires_at IS NULL OR expires_at > now())`,
      [tokenHash]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async recordUsage(tokenId: string): Promise<void> {
    await pool.query(
      `UPDATE api_tokens SET last_used_at = now(), request_count = request_count + 1 WHERE id = $1`,
      [tokenId]
    );
  }
}

export const apiTokenService = new ApiTokenService();
