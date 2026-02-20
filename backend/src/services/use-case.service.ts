import { pool } from '../db/pool';
import { orchestratorService } from './orchestrator.service';
import { registryService } from './registry.service';
import type {
  UseCaseTemplate,
  UseCaseContextParam,
  UseCaseCallDef,
  UseCaseExecutionResult,
  UseCaseListItem,
  OrchestratorApiCall,
} from '../types';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150);
}

interface ListFilters {
  tags?: string[];
  search?: string;
  is_active?: boolean;
}

class UseCaseService {
  // ── Admin CRUD ─────────────────────────────────────────

  async listByTenant(tenantId: string, filters?: ListFilters): Promise<UseCaseTemplate[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (filters?.tags && filters.tags.length > 0) {
      conditions.push(`tags && $${idx++}`);
      params.push(filters.tags);
    }
    if (filters?.search) {
      conditions.push(`(name ILIKE $${idx} OR slug ILIKE $${idx} OR description ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }
    if (filters?.is_active !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      params.push(filters.is_active);
    }

    const { rows } = await pool.query<UseCaseTemplate>(
      `SELECT * FROM use_case_templates WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
      params
    );
    return rows;
  }

  async getById(id: string, tenantId: string): Promise<UseCaseTemplate | null> {
    const { rows } = await pool.query<UseCaseTemplate>(
      'SELECT * FROM use_case_templates WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return rows[0] || null;
  }

  async getBySlug(slug: string, tenantId: string): Promise<UseCaseTemplate | null> {
    const { rows } = await pool.query<UseCaseTemplate>(
      'SELECT * FROM use_case_templates WHERE slug = $1 AND tenant_id = $2',
      [slug, tenantId]
    );
    return rows[0] || null;
  }

  async create(
    tenantId: string,
    userId: string,
    data: {
      slug?: string;
      name: string;
      description?: string;
      required_context?: UseCaseContextParam[];
      calls?: UseCaseCallDef[];
      mode?: 'parallel' | 'sequential';
      tags?: string[];
      is_active?: boolean;
    }
  ): Promise<UseCaseTemplate> {
    const slug = data.slug || generateSlug(data.name);
    const { rows } = await pool.query<UseCaseTemplate>(
      `INSERT INTO use_case_templates
        (tenant_id, slug, name, description, required_context, calls, mode, tags, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        tenantId,
        slug,
        data.name,
        data.description || null,
        JSON.stringify(data.required_context || []),
        JSON.stringify(data.calls || []),
        data.mode || 'parallel',
        data.tags || [],
        data.is_active !== undefined ? data.is_active : true,
        userId,
      ]
    );
    return rows[0];
  }

  async update(id: string, tenantId: string, data: Record<string, unknown>): Promise<UseCaseTemplate | null> {
    const existing = await this.getById(id, tenantId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const stringFields = ['slug', 'name', 'description', 'mode'];
    for (const f of stringFields) {
      if (data[f] !== undefined) {
        fields.push(`${f} = $${idx++}`);
        values.push(data[f]);
      }
    }

    const jsonbFields = ['required_context', 'calls'];
    for (const f of jsonbFields) {
      if (data[f] !== undefined) {
        fields.push(`${f} = $${idx++}`);
        values.push(data[f] === null ? null : JSON.stringify(data[f]));
      }
    }

    if (data.tags !== undefined) {
      fields.push(`tags = $${idx++}`);
      values.push(data.tags);
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(data.is_active);
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = now()');
    values.push(id);
    values.push(tenantId);

    const { rows } = await pool.query<UseCaseTemplate>(
      `UPDATE use_case_templates SET ${fields.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      'DELETE FROM use_case_templates WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return (rowCount ?? 0) > 0;
  }

  // ── Gateway Discovery ──────────────────────────────────

  async listAvailable(tenantId: string): Promise<UseCaseListItem[]> {
    const { rows } = await pool.query<UseCaseTemplate>(
      `SELECT slug, name, description, required_context, calls, tags, mode
       FROM use_case_templates
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY name ASC`,
      [tenantId]
    );
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      required_context: r.required_context,
      tags: r.tags,
      call_count: Array.isArray(r.calls) ? r.calls.length : 0,
      mode: r.mode,
    }));
  }

  // ── Gateway Execution ──────────────────────────────────

  async execute(
    slug: string,
    connectionId: string,
    tenantId: string,
    userId: string,
    context: Record<string, string>
  ): Promise<UseCaseExecutionResult> {
    const template = await this.getBySlug(slug, tenantId);
    if (!template) throw new Error(`Use-case template not found: ${slug}`);
    if (!template.is_active) throw new Error(`Use-case template is inactive: ${slug}`);

    // Validate required context params
    for (const param of template.required_context) {
      if (param.required && (!context[param.name] || context[param.name].trim() === '')) {
        throw new Error(`Missing required context parameter: ${param.name}`);
      }
    }

    // Build orchestrator calls from template
    const orchestratorCalls: OrchestratorApiCall[] = template.calls.map((callDef) => {
      const resolvedParams: Record<string, string> = {};
      for (const [paramName, templateVal] of Object.entries(callDef.param_mapping)) {
        resolvedParams[paramName] = this.resolveTemplate(templateVal, context);
      }

      const resolvedHeaders: Record<string, string> = {};
      if (callDef.headers) {
        for (const [hName, hVal] of Object.entries(callDef.headers)) {
          resolvedHeaders[hName] = this.resolveTemplate(hVal, context);
        }
      }

      let resolvedBody: string | undefined;
      if (callDef.body) {
        resolvedBody = this.resolveTemplate(callDef.body, context);
      }

      return {
        slug: callDef.slug,
        params: resolvedParams,
        headers: Object.keys(resolvedHeaders).length > 0 ? resolvedHeaders : undefined,
        body: resolvedBody,
      };
    });

    const result = await orchestratorService.executeQuery(
      connectionId,
      tenantId,
      userId,
      orchestratorCalls,
      template.mode
    );

    return {
      template_slug: template.slug,
      template_name: template.name,
      totalDurationMs: result.totalDurationMs,
      mode: result.mode,
      context,
      results: result.results,
    };
  }

  // ── Validation (dry-run) ───────────────────────────────

  async validate(slug: string, tenantId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    resolved_slugs: string[];
    unresolved_slugs: string[];
  }> {
    const template = await this.getBySlug(slug, tenantId);
    if (!template) {
      return { valid: false, errors: ['Template not found'], warnings: [], resolved_slugs: [], unresolved_slugs: [] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const resolved: string[] = [];
    const unresolved: string[] = [];

    for (const callDef of template.calls) {
      const def = await registryService.getBySlug(callDef.slug, tenantId);
      if (!def) {
        unresolved.push(callDef.slug);
        errors.push(`API slug "${callDef.slug}" not found in registry`);
      } else {
        resolved.push(callDef.slug);
        if (!def.is_active) {
          warnings.push(`API "${callDef.slug}" is inactive`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      resolved_slugs: resolved,
      unresolved_slugs: unresolved,
    };
  }

  // ── Template resolution ────────────────────────────────

  private resolveTemplate(template: string, context: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
      return context[varName] !== undefined ? context[varName] : `{{${varName}}}`;
    });
  }
}

export const useCaseService = new UseCaseService();
