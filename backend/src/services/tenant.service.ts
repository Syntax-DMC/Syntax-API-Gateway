import { pool } from '../db/pool';
import { Tenant } from '../types';

const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

type TenantWithCount = Tenant & { user_count: number };

class TenantService {
  async list(): Promise<TenantWithCount[]> {
    const { rows } = await pool.query<TenantWithCount>(
      `SELECT t.*, COALESCE(uc.cnt, 0)::int AS user_count
       FROM tenants t
       LEFT JOIN (
         SELECT tenant_id, COUNT(*) AS cnt FROM user_tenants GROUP BY tenant_id
       ) uc ON uc.tenant_id = t.id
       ORDER BY t.created_at ASC`
    );
    return rows;
  }

  async getById(id: string): Promise<TenantWithCount | null> {
    const { rows } = await pool.query<TenantWithCount>(
      `SELECT t.*, COALESCE(uc.cnt, 0)::int AS user_count
       FROM tenants t
       LEFT JOIN (
         SELECT tenant_id, COUNT(*) AS cnt FROM user_tenants WHERE tenant_id = $1 GROUP BY tenant_id
       ) uc ON uc.tenant_id = t.id
       WHERE t.id = $1`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async create(data: { name: string; slug: string }): Promise<Tenant> {
    const { rows } = await pool.query<Tenant>(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING *`,
      [data.name, data.slug]
    );
    return rows[0];
  }

  async update(id: string, data: { name?: string; slug?: string; is_active?: boolean }): Promise<Tenant | null> {
    if (id === PLATFORM_TENANT_ID && data.is_active === false) {
      throw new Error('Cannot deactivate the Platform tenant');
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.slug !== undefined) {
      fields.push(`slug = $${idx++}`);
      values.push(data.slug);
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(data.is_active);
    }

    if (fields.length === 0) return this.getById(id);

    fields.push('updated_at = now()');
    values.push(id);

    const { rows } = await pool.query<Tenant>(
      `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async deactivate(id: string): Promise<Tenant | null> {
    if (id === PLATFORM_TENANT_ID) {
      throw new Error('Cannot deactivate the Platform tenant');
    }

    // Cascade deactivation in a single transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE user_tenants SET is_active = false WHERE tenant_id = $1', [id]);
      await client.query('UPDATE sap_connections SET is_active = false WHERE tenant_id = $1', [id]);
      await client.query('UPDATE api_tokens SET is_active = false WHERE tenant_id = $1', [id]);
      await client.query('UPDATE tenants SET is_active = false, updated_at = now() WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.getById(id);
  }
}

export const tenantService = new TenantService();
