import { pool } from '../db/pool';
import { RequestLog } from '../types';

// Columns returned for list queries (excludes large body columns for performance)
const LIST_COLUMNS = `r.id, r.api_token_id, r.sap_connection_id, r.direction, r.target,
  r.method, r.path, r.request_headers, r.request_body_size,
  r.status_code, r.response_body_size, r.duration_ms, r.error_message, r.created_at`;

interface LogFilter {
  userId: string;
  tenantId: string;
  target?: 'agent' | 'sap_dm';
  connectionId?: string;
  tokenId?: string;
  statusRange?: '2xx' | '4xx' | '5xx';
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

interface LogListResult {
  data: RequestLog[];
  total: number;
  page: number;
  pages: number;
}

interface LogStats {
  totalRequests: number;
  byTarget: { agent: number; sap_dm: number };
  byStatus: { '2xx': number; '4xx': number; '5xx': number };
  avgDurationMs: { agent: number; sap_dm: number };
  topPaths: { path: string; count: number }[];
}

class LogService {
  async list(filter: LogFilter): Promise<LogListResult> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 50));
    const offset = (page - 1) * limit;

    const { where, params } = this.buildWhere(filter);

    // Count + data in parallel for speed
    const countIdx = params.length + 1;
    const limitIdx = params.length + 2;

    const [countResult, dataResult] = await Promise.all([
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM request_logs r
         JOIN api_tokens t ON t.id = r.api_token_id
         ${where}`,
        params
      ),
      pool.query<RequestLog>(
        `SELECT ${LIST_COLUMNS} FROM request_logs r
         JOIN api_tokens t ON t.id = r.api_token_id
         ${where}
         ORDER BY r.created_at DESC
         OFFSET $${countIdx} LIMIT $${limitIdx}`,
        [...params, offset, limit]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    return {
      data: dataResult.rows,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    };
  }

  async getById(logId: string, userId: string, tenantId?: string): Promise<RequestLog | null> {
    let query = `SELECT r.* FROM request_logs r
       JOIN api_tokens t ON t.id = r.api_token_id
       WHERE r.id = $1 AND t.user_id = $2`;
    const params: unknown[] = [logId, userId];
    if (tenantId) {
      query += ' AND t.tenant_id = $3';
      params.push(tenantId);
    }
    const result = await pool.query<RequestLog>(query, params);
    return result.rows[0] || null;
  }

  async stats(
    userId: string,
    tenantId: string,
    connectionId?: string,
    period: '24h' | '7d' | '30d' = '24h'
  ): Promise<LogStats> {
    const intervalMap = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
    const interval = intervalMap[period];

    const params: unknown[] = [userId, tenantId];
    let connFilter = '';
    if (connectionId) {
      params.push(connectionId);
      connFilter = `AND r.sap_connection_id = $${params.length}`;
    }
    params.push(interval);
    const intervalIdx = params.length;

    const [summary, topPaths] = await Promise.all([
      pool.query<{
        total: string;
        agent_count: string;
        sap_dm_count: string;
        status_2xx: string;
        status_4xx: string;
        status_5xx: string;
        avg_agent_ms: string | null;
        avg_sap_ms: string | null;
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE r.target = 'agent') AS agent_count,
           COUNT(*) FILTER (WHERE r.target = 'sap_dm') AS sap_dm_count,
           COUNT(*) FILTER (WHERE r.status_code BETWEEN 200 AND 299) AS status_2xx,
           COUNT(*) FILTER (WHERE r.status_code BETWEEN 400 AND 499) AS status_4xx,
           COUNT(*) FILTER (WHERE r.status_code BETWEEN 500 AND 599) AS status_5xx,
           ROUND(AVG(r.duration_ms) FILTER (WHERE r.target = 'agent'))::text AS avg_agent_ms,
           ROUND(AVG(r.duration_ms) FILTER (WHERE r.target = 'sap_dm'))::text AS avg_sap_ms
         FROM request_logs r
         JOIN api_tokens t ON t.id = r.api_token_id
         WHERE t.user_id = $1 AND t.tenant_id = $2 ${connFilter}
           AND r.created_at > now() - $${intervalIdx}::interval`,
        params
      ),
      pool.query<{ path: string; count: string }>(
        `SELECT r.path, COUNT(*) AS count
         FROM request_logs r
         JOIN api_tokens t ON t.id = r.api_token_id
         WHERE t.user_id = $1 AND t.tenant_id = $2 ${connFilter}
           AND r.created_at > now() - $${intervalIdx}::interval
         GROUP BY r.path
         ORDER BY count DESC
         LIMIT 10`,
        params
      ),
    ]);

    const s = summary.rows[0];

    return {
      totalRequests: parseInt(s.total, 10),
      byTarget: {
        agent: parseInt(s.agent_count, 10),
        sap_dm: parseInt(s.sap_dm_count, 10),
      },
      byStatus: {
        '2xx': parseInt(s.status_2xx, 10),
        '4xx': parseInt(s.status_4xx, 10),
        '5xx': parseInt(s.status_5xx, 10),
      },
      avgDurationMs: {
        agent: parseInt(s.avg_agent_ms || '0', 10),
        sap_dm: parseInt(s.avg_sap_ms || '0', 10),
      },
      topPaths: topPaths.rows.map((r) => ({
        path: r.path,
        count: parseInt(r.count, 10),
      })),
    };
  }

  async distinctPaths(
    userId: string,
    tenantId: string,
    connectionId?: string
  ): Promise<{ method: string; path: string; count: number; last_used: Date }[]> {
    const params: unknown[] = [userId, tenantId];
    let connFilter = '';
    if (connectionId) {
      params.push(connectionId);
      connFilter = `AND r.sap_connection_id = $${params.length}`;
    }

    const { rows } = await pool.query<{
      method: string;
      path: string;
      count: string;
      last_used: Date;
    }>(
      `SELECT r.method, r.path, COUNT(*) AS count, MAX(r.created_at) AS last_used
       FROM request_logs r
       JOIN api_tokens t ON t.id = r.api_token_id
       WHERE t.user_id = $1 AND t.tenant_id = $2 ${connFilter}
       GROUP BY r.method, r.path
       ORDER BY count DESC
       LIMIT 50`,
      params
    );

    return rows.map((r) => ({
      method: r.method,
      path: r.path,
      count: parseInt(r.count, 10),
      last_used: r.last_used,
    }));
  }

  async deleteAll(userId: string, tenantId: string): Promise<number> {
    const result = await pool.query(
      `DELETE FROM request_logs r
       USING api_tokens t
       WHERE t.id = r.api_token_id AND t.user_id = $1 AND t.tenant_id = $2`,
      [userId, tenantId]
    );
    return result.rowCount ?? 0;
  }

  private buildWhere(filter: LogFilter): { where: string; params: unknown[] } {
    const conditions: string[] = ['t.user_id = $1', 't.tenant_id = $2'];
    const params: unknown[] = [filter.userId, filter.tenantId];
    let idx = 3;

    if (filter.target) {
      conditions.push(`r.target = $${idx++}`);
      params.push(filter.target);
    }
    if (filter.connectionId) {
      conditions.push(`r.sap_connection_id = $${idx++}`);
      params.push(filter.connectionId);
    }
    if (filter.tokenId) {
      conditions.push(`r.api_token_id = $${idx++}`);
      params.push(filter.tokenId);
    }
    if (filter.statusRange) {
      const rangeMap: Record<string, [number, number]> = {
        '2xx': [200, 299],
        '4xx': [400, 499],
        '5xx': [500, 599],
      };
      const [lo, hi] = rangeMap[filter.statusRange];
      conditions.push(`r.status_code BETWEEN $${idx++} AND $${idx++}`);
      params.push(lo, hi);
    }
    if (filter.from) {
      conditions.push(`r.created_at >= $${idx++}`);
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push(`r.created_at <= $${idx++}`);
      params.push(filter.to);
    }

    return {
      where: 'WHERE ' + conditions.join(' AND '),
      params,
    };
  }
}

export const logService = new LogService();
