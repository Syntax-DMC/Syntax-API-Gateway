import { pool } from '../db/pool';

export interface CatalogItem {
  id: string;
  user_id: string;
  tenant_id: string;
  sap_connection_id: string | null;
  title: string;
  method: string;
  path: string;
  headers: Record<string, string> | null;
  body: string | null;
  created_at: Date;
  updated_at: Date;
}

class CatalogService {
  async listByUserAndTenant(userId: string, tenantId: string): Promise<CatalogItem[]> {
    const { rows } = await pool.query<CatalogItem>(
      'SELECT * FROM api_catalog WHERE user_id = $1 AND tenant_id = $2 ORDER BY title ASC',
      [userId, tenantId]
    );
    return rows;
  }

  async getById(id: string, userId: string, tenantId?: string): Promise<CatalogItem | null> {
    let query = 'SELECT * FROM api_catalog WHERE id = $1 AND user_id = $2';
    const params: unknown[] = [id, userId];
    if (tenantId) {
      query += ' AND tenant_id = $3';
      params.push(tenantId);
    }
    const { rows } = await pool.query<CatalogItem>(query, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async create(
    userId: string,
    tenantId: string,
    data: {
      title: string;
      method: string;
      path: string;
      sap_connection_id?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<CatalogItem> {
    const { rows } = await pool.query<CatalogItem>(
      `INSERT INTO api_catalog (user_id, tenant_id, sap_connection_id, title, method, path, headers, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        tenantId,
        data.sap_connection_id || null,
        data.title,
        data.method,
        data.path,
        data.headers ? JSON.stringify(data.headers) : null,
        data.body || null,
      ]
    );
    return rows[0];
  }

  async update(
    id: string,
    userId: string,
    data: {
      title?: string;
      method?: string;
      path?: string;
      sap_connection_id?: string | null;
      headers?: Record<string, string> | null;
      body?: string | null;
    },
    tenantId?: string
  ): Promise<CatalogItem | null> {
    const existing = await this.getById(id, userId, tenantId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(data.title);
    }
    if (data.method !== undefined) {
      fields.push(`method = $${idx++}`);
      values.push(data.method);
    }
    if (data.path !== undefined) {
      fields.push(`path = $${idx++}`);
      values.push(data.path);
    }
    if (data.sap_connection_id !== undefined) {
      fields.push(`sap_connection_id = $${idx++}`);
      values.push(data.sap_connection_id);
    }
    if (data.headers !== undefined) {
      fields.push(`headers = $${idx++}`);
      values.push(data.headers ? JSON.stringify(data.headers) : null);
    }
    if (data.body !== undefined) {
      fields.push(`body = $${idx++}`);
      values.push(data.body);
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = now()');
    values.push(id);

    const { rows } = await pool.query<CatalogItem>(
      `UPDATE api_catalog SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async delete(id: string, userId: string, tenantId?: string): Promise<boolean> {
    let query = 'DELETE FROM api_catalog WHERE id = $1 AND user_id = $2';
    const params: unknown[] = [id, userId];
    if (tenantId) {
      query += ' AND tenant_id = $3';
      params.push(tenantId);
    }
    const { rowCount } = await pool.query(query, params);
    return (rowCount ?? 0) > 0;
  }
}

export const catalogService = new CatalogService();
