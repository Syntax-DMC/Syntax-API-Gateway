import { pool } from '../db/pool';
import { ApiDefinition, ApiDefinitionVersion } from '../types';

interface ListFilters {
  tags?: string[];
  method?: string;
  search?: string;
  is_active?: boolean;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150);
}

class RegistryService {
  async listByTenant(tenantId: string, filters?: ListFilters): Promise<ApiDefinition[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (filters?.tags && filters.tags.length > 0) {
      conditions.push(`tags && $${idx++}`);
      params.push(filters.tags);
    }
    if (filters?.method) {
      conditions.push(`method = $${idx++}`);
      params.push(filters.method.toUpperCase());
    }
    if (filters?.search) {
      conditions.push(`(name ILIKE $${idx} OR slug ILIKE $${idx} OR path ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }
    if (filters?.is_active !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      params.push(filters.is_active);
    }

    const { rows } = await pool.query<ApiDefinition>(
      `SELECT * FROM api_definitions WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
      params
    );
    return rows;
  }

  async getById(id: string, tenantId: string): Promise<ApiDefinition | null> {
    const { rows } = await pool.query<ApiDefinition>(
      'SELECT * FROM api_definitions WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async getBySlug(slug: string, tenantId: string): Promise<ApiDefinition | null> {
    const { rows } = await pool.query<ApiDefinition>(
      'SELECT * FROM api_definitions WHERE slug = $1 AND tenant_id = $2',
      [slug, tenantId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async create(
    tenantId: string,
    userId: string,
    data: {
      slug?: string;
      name: string;
      description?: string;
      version?: string;
      spec_format?: string;
      method: string;
      path: string;
      query_params?: unknown[];
      request_headers?: unknown[];
      request_body?: unknown;
      response_schema?: unknown;
      provides?: string[];
      depends_on?: unknown[];
      tags?: string[];
      is_active?: boolean;
    }
  ): Promise<ApiDefinition> {
    const slug = data.slug || generateSlug(data.name);

    const { rows } = await pool.query<ApiDefinition>(
      `INSERT INTO api_definitions
        (tenant_id, slug, name, description, version, spec_format, method, path,
         query_params, request_headers, request_body, response_schema,
         provides, depends_on, tags, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        tenantId,
        slug,
        data.name,
        data.description || null,
        data.version || '1.0',
        data.spec_format || 'manual',
        data.method.toUpperCase(),
        data.path,
        JSON.stringify(data.query_params || []),
        JSON.stringify(data.request_headers || []),
        data.request_body ? JSON.stringify(data.request_body) : null,
        data.response_schema ? JSON.stringify(data.response_schema) : null,
        data.provides || [],
        JSON.stringify(data.depends_on || []),
        data.tags || [],
        data.is_active !== undefined ? data.is_active : true,
        userId,
      ]
    );
    return rows[0];
  }

  async update(
    id: string,
    tenantId: string,
    userId: string,
    data: Record<string, unknown>
  ): Promise<ApiDefinition | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    // Create version snapshot before updating
    await this.createVersionSnapshot(id, tenantId, userId, 'Update');

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const stringFields = ['slug', 'name', 'description', 'version', 'spec_format', 'method', 'path'];
    for (const f of stringFields) {
      if (data[f] !== undefined) {
        const val = f === 'method' ? (data[f] as string).toUpperCase() : data[f];
        fields.push(`${f} = $${idx++}`);
        values.push(val);
      }
    }

    const jsonbFields = ['query_params', 'request_headers', 'request_body', 'response_schema', 'depends_on'];
    for (const f of jsonbFields) {
      if (data[f] !== undefined) {
        fields.push(`${f} = $${idx++}`);
        values.push(data[f] === null ? null : JSON.stringify(data[f]));
      }
    }

    const arrayFields = ['provides', 'tags'];
    for (const f of arrayFields) {
      if (data[f] !== undefined) {
        fields.push(`${f} = $${idx++}`);
        values.push(data[f]);
      }
    }

    if (data.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(data.is_active);
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = now()');
    values.push(id);
    values.push(tenantId);

    const { rows } = await pool.query<ApiDefinition>(
      `UPDATE api_definitions SET ${fields.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
      values
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      'DELETE FROM api_definitions WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return (rowCount ?? 0) > 0;
  }

  async deleteAll(tenantId: string): Promise<number> {
    const { rowCount } = await pool.query(
      'DELETE FROM api_definitions WHERE tenant_id = $1',
      [tenantId]
    );
    return rowCount ?? 0;
  }

  async bulkCreate(
    tenantId: string,
    userId: string,
    definitions: Array<{
      slug?: string;
      name: string;
      description?: string;
      version?: string;
      spec_format?: string;
      method: string;
      path: string;
      query_params?: unknown[];
      request_headers?: unknown[];
      request_body?: unknown;
      response_schema?: unknown;
      provides?: string[];
      depends_on?: unknown[];
      tags?: string[];
    }>
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const client = await pool.connect();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    try {
      await client.query('BEGIN');

      for (const def of definitions) {
        try {
          const slug = def.slug || generateSlug(def.name);
          const result = await client.query(
            `INSERT INTO api_definitions
              (tenant_id, slug, name, description, version, spec_format, method, path,
               query_params, request_headers, request_body, response_schema,
               provides, depends_on, tags, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (tenant_id, slug) DO NOTHING
             RETURNING id`,
            [
              tenantId,
              slug,
              def.name,
              def.description || null,
              def.version || '1.0',
              def.spec_format || 'manual',
              def.method.toUpperCase(),
              def.path,
              JSON.stringify(def.query_params || []),
              JSON.stringify(def.request_headers || []),
              def.request_body ? JSON.stringify(def.request_body) : null,
              def.response_schema ? JSON.stringify(def.response_schema) : null,
              def.provides || [],
              JSON.stringify(def.depends_on || []),
              def.tags || [],
              userId,
            ]
          );
          if (result.rowCount && result.rowCount > 0) {
            created++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors.push(`${def.name}: ${(err as Error).message}`);
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { created, skipped, errors };
  }

  async getVersions(apiDefId: string, tenantId: string): Promise<ApiDefinitionVersion[]> {
    // Verify the definition belongs to tenant
    const def = await this.getById(apiDefId, tenantId);
    if (!def) return [];

    const { rows } = await pool.query<ApiDefinitionVersion>(
      'SELECT * FROM api_definition_versions WHERE api_definition_id = $1 ORDER BY version_number DESC',
      [apiDefId]
    );
    return rows;
  }

  async getVersion(apiDefId: string, versionNum: number, tenantId: string): Promise<ApiDefinitionVersion | null> {
    const def = await this.getById(apiDefId, tenantId);
    if (!def) return null;

    const { rows } = await pool.query<ApiDefinitionVersion>(
      'SELECT * FROM api_definition_versions WHERE api_definition_id = $1 AND version_number = $2',
      [apiDefId, versionNum]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async revertToVersion(
    apiDefId: string,
    versionNum: number,
    tenantId: string,
    userId: string
  ): Promise<ApiDefinition | null> {
    const version = await this.getVersion(apiDefId, versionNum, tenantId);
    if (!version) return null;

    const snapshot = version.snapshot as Record<string, unknown>;
    return this.update(apiDefId, tenantId, userId, {
      slug: snapshot.slug,
      name: snapshot.name,
      description: snapshot.description,
      version: snapshot.version,
      spec_format: snapshot.spec_format,
      method: snapshot.method,
      path: snapshot.path,
      query_params: snapshot.query_params,
      request_headers: snapshot.request_headers,
      request_body: snapshot.request_body,
      response_schema: snapshot.response_schema,
      provides: snapshot.provides,
      depends_on: snapshot.depends_on,
      tags: snapshot.tags,
      is_active: snapshot.is_active,
    });
  }

  private async createVersionSnapshot(
    apiDefId: string,
    tenantId: string,
    userId: string,
    summary?: string
  ): Promise<void> {
    const current = await this.getById(apiDefId, tenantId);
    if (!current) return;

    const { rows: maxRows } = await pool.query<{ max_num: number | null }>(
      'SELECT MAX(version_number) as max_num FROM api_definition_versions WHERE api_definition_id = $1',
      [apiDefId]
    );
    const nextNum = (maxRows[0]?.max_num ?? 0) + 1;

    const { id: _id, tenant_id: _tid, created_by: _cb, created_at: _ca, updated_at: _ua, ...snapshot } = current;

    await pool.query(
      `INSERT INTO api_definition_versions (api_definition_id, version_number, snapshot, change_summary, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [apiDefId, nextNum, JSON.stringify(snapshot), summary || null, userId]
    );
  }
}

export const registryService = new RegistryService();
