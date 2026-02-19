import { pool } from '../db/pool';
import { SapConnection } from '../types';
import { cryptoService } from './crypto.service';

type ConnectionPublic = Omit<SapConnection, 'client_secret_enc' | 'agent_api_key_enc'> & {
  has_agent_config: boolean;
};

function toPublic(row: SapConnection): ConnectionPublic {
  const { client_secret_enc: _, agent_api_key_enc: __, ...rest } = row;
  return {
    ...rest,
    has_agent_config: !!(row.agent_api_url && row.agent_api_key_enc),
  };
}

class ConnectionService {
  async listByUserAndTenant(userId: string, tenantId: string): Promise<ConnectionPublic[]> {
    const { rows } = await pool.query<SapConnection>(
      'SELECT * FROM sap_connections WHERE user_id = $1 AND tenant_id = $2 ORDER BY created_at ASC',
      [userId, tenantId]
    );
    return rows.map(toPublic);
  }

  async getById(id: string, userId: string, tenantId?: string): Promise<ConnectionPublic | null> {
    let query = 'SELECT * FROM sap_connections WHERE id = $1 AND user_id = $2';
    const params: unknown[] = [id, userId];
    if (tenantId) {
      query += ' AND tenant_id = $3';
      params.push(tenantId);
    }
    const { rows } = await pool.query<SapConnection>(query, params);
    return rows.length > 0 ? toPublic(rows[0]) : null;
  }

  async getRaw(id: string): Promise<SapConnection | null> {
    const { rows } = await pool.query<SapConnection>(
      'SELECT * FROM sap_connections WHERE id = $1',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async create(
    userId: string,
    tenantId: string,
    data: {
      name: string;
      sapBaseUrl: string;
      tokenUrl: string;
      clientId: string;
      clientSecret: string;
      agentApiUrl?: string;
      agentApiKey?: string;
    }
  ): Promise<ConnectionPublic> {
    const clientSecretEnc = await cryptoService.encrypt(data.clientSecret);
    const agentApiKeyEnc = data.agentApiKey
      ? await cryptoService.encrypt(data.agentApiKey)
      : null;

    const { rows } = await pool.query<SapConnection>(
      `INSERT INTO sap_connections
        (user_id, tenant_id, name, sap_base_url, token_url, client_id, client_secret_enc, agent_api_url, agent_api_key_enc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        tenantId,
        data.name,
        data.sapBaseUrl,
        data.tokenUrl,
        data.clientId,
        clientSecretEnc,
        data.agentApiUrl || null,
        agentApiKeyEnc,
      ]
    );
    return toPublic(rows[0]);
  }

  async update(
    id: string,
    userId: string,
    data: {
      name?: string;
      sapBaseUrl?: string;
      tokenUrl?: string;
      clientId?: string;
      clientSecret?: string;
      agentApiUrl?: string | null;
      agentApiKey?: string | null;
      is_active?: boolean;
    },
    tenantId?: string
  ): Promise<ConnectionPublic | null> {
    // Verify ownership
    const existing = await this.getById(id, userId, tenantId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.sapBaseUrl !== undefined) {
      fields.push(`sap_base_url = $${idx++}`);
      values.push(data.sapBaseUrl);
    }
    if (data.tokenUrl !== undefined) {
      fields.push(`token_url = $${idx++}`);
      values.push(data.tokenUrl);
    }
    if (data.clientId !== undefined) {
      fields.push(`client_id = $${idx++}`);
      values.push(data.clientId);
    }
    if (data.clientSecret !== undefined) {
      fields.push(`client_secret_enc = $${idx++}`);
      values.push(await cryptoService.encrypt(data.clientSecret));
    }
    if (data.agentApiUrl !== undefined) {
      fields.push(`agent_api_url = $${idx++}`);
      values.push(data.agentApiUrl);
    }
    if (data.agentApiKey !== undefined) {
      if (data.agentApiKey === null) {
        fields.push(`agent_api_key_enc = $${idx++}`);
        values.push(null);
      } else {
        fields.push(`agent_api_key_enc = $${idx++}`);
        values.push(await cryptoService.encrypt(data.agentApiKey));
      }
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(data.is_active);
    }

    if (fields.length === 0) return existing;

    fields.push(`updated_at = now()`);
    values.push(id);

    const { rows } = await pool.query<SapConnection>(
      `UPDATE sap_connections SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows.length > 0 ? toPublic(rows[0]) : null;
  }

  async delete(id: string, userId: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM sap_connections WHERE id = $1 AND user_id = $2';
    const params: unknown[] = [id, userId];
    if (tenantId) {
      query += ' AND tenant_id = $3';
      params.push(tenantId);
    }
    const { rowCount } = await pool.query(query, params);
    return (rowCount ?? 0) > 0;
  }
}

export const connectionService = new ConnectionService();
