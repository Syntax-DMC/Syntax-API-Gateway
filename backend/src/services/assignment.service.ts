import { pool } from '../db/pool';
import { ConnectionApiAssignment, ConnectionApiAssignmentWithConnection } from '../types';

class AssignmentService {
  async listByDefinition(
    apiDefId: string,
    tenantId: string
  ): Promise<ConnectionApiAssignmentWithConnection[]> {
    const { rows } = await pool.query<ConnectionApiAssignmentWithConnection>(
      `SELECT a.*, c.name AS connection_name, c.sap_base_url, c.is_active AS connection_is_active
       FROM connection_api_assignments a
       JOIN sap_connections c ON c.id = a.sap_connection_id
       WHERE a.api_definition_id = $1 AND a.tenant_id = $2
       ORDER BY c.name ASC`,
      [apiDefId, tenantId]
    );
    return rows;
  }

  async listByConnection(
    connectionId: string,
    tenantId: string
  ): Promise<(ConnectionApiAssignment & { api_name: string; api_slug: string; api_method: string; api_path: string })[]> {
    const { rows } = await pool.query(
      `SELECT a.*, d.name AS api_name, d.slug AS api_slug, d.method AS api_method, d.path AS api_path
       FROM connection_api_assignments a
       JOIN api_definitions d ON d.id = a.api_definition_id
       WHERE a.sap_connection_id = $1 AND a.tenant_id = $2
       ORDER BY d.name ASC`,
      [connectionId, tenantId]
    );
    return rows;
  }

  async assign(
    tenantId: string,
    userId: string,
    connectionId: string,
    apiDefId: string
  ): Promise<ConnectionApiAssignment> {
    // Verify both belong to the tenant
    const { rows: connRows } = await pool.query(
      'SELECT id FROM sap_connections WHERE id = $1 AND tenant_id = $2',
      [connectionId, tenantId]
    );
    if (connRows.length === 0) throw new Error('Connection not found');

    const { rows: defRows } = await pool.query(
      'SELECT id FROM api_definitions WHERE id = $1 AND tenant_id = $2',
      [apiDefId, tenantId]
    );
    if (defRows.length === 0) throw new Error('API definition not found');

    const { rows } = await pool.query<ConnectionApiAssignment>(
      `INSERT INTO connection_api_assignments
        (sap_connection_id, api_definition_id, tenant_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [connectionId, apiDefId, tenantId, userId]
    );
    return rows[0];
  }

  async unassign(id: string, tenantId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      'DELETE FROM connection_api_assignments WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return (rowCount ?? 0) > 0;
  }

  async bulkAssign(
    tenantId: string,
    userId: string,
    connectionId: string,
    apiDefIds: string[]
  ): Promise<{ assigned: number; skipped: number }> {
    const { rows: connRows } = await pool.query(
      'SELECT id FROM sap_connections WHERE id = $1 AND tenant_id = $2',
      [connectionId, tenantId]
    );
    if (connRows.length === 0) throw new Error('Connection not found');

    let assigned = 0;
    let skipped = 0;

    for (const apiDefId of apiDefIds) {
      const { rowCount } = await pool.query(
        `INSERT INTO connection_api_assignments
          (sap_connection_id, api_definition_id, tenant_id, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (sap_connection_id, api_definition_id) DO NOTHING`,
        [connectionId, apiDefId, tenantId, userId]
      );
      if (rowCount && rowCount > 0) assigned++;
      else skipped++;
    }

    return { assigned, skipped };
  }

  async replaceAssignments(
    tenantId: string,
    userId: string,
    connectionId: string,
    apiDefIds: string[]
  ): Promise<{ assigned: number; removed: number }> {
    const { rows: connRows } = await pool.query(
      'SELECT id FROM sap_connections WHERE id = $1 AND tenant_id = $2',
      [connectionId, tenantId]
    );
    if (connRows.length === 0) throw new Error('Connection not found');

    const { rowCount } = await pool.query(
      'DELETE FROM connection_api_assignments WHERE sap_connection_id = $1 AND tenant_id = $2',
      [connectionId, tenantId]
    );

    let assigned = 0;
    for (const apiDefId of apiDefIds) {
      await pool.query(
        `INSERT INTO connection_api_assignments
          (sap_connection_id, api_definition_id, tenant_id, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (sap_connection_id, api_definition_id) DO NOTHING`,
        [connectionId, apiDefId, tenantId, userId]
      );
      assigned++;
    }

    return { assigned, removed: rowCount ?? 0 };
  }
}

export const assignmentService = new AssignmentService();
