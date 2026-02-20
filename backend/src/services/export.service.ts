import { pool } from '../db/pool';
import { assignmentService } from './assignment.service';
import { registryService } from './registry.service';
import {
  ApiDefinition,
  ExportOptions,
  ExportFormat,
  ExportScope,
  ConnectionExportMeta,
  ToolkitConfig,
  ParamDefinition,
} from '../types';

// js-yaml is a transitive dependency of @apidevtools/swagger-parser
import yaml from 'js-yaml';

class ExportService {
  // ── Public API ──────────────────────────────────────────

  async generateSpec(
    options: ExportOptions
  ): Promise<{ content: string; contentType: string; filename: string; apiCount: number }> {
    const connName = await this.getConnectionName(options.connectionId, options.tenantId);
    const definitions = await this.getAssignedDefinitions(options.connectionId, options.tenantId);
    const safeName = connName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    let spec: Record<string, unknown>;
    let content: string;
    let contentType: string;
    let filename: string;

    switch (options.format) {
      case 'openapi3_yaml': {
        spec = this.buildOpenApi3Spec(connName, options.gatewayUrl, definitions, options.scope);
        content = yaml.dump(spec, { lineWidth: 120, noRefs: true });
        contentType = 'text/yaml; charset=utf-8';
        filename = `${safeName}-openapi3.yaml`;
        break;
      }
      case 'swagger2_json': {
        spec = this.buildSwagger2Spec(connName, options.gatewayUrl, definitions, options.scope);
        content = JSON.stringify(spec, null, 2);
        contentType = 'application/json; charset=utf-8';
        filename = `${safeName}-swagger2.json`;
        break;
      }
      case 'openapi3_json':
      default: {
        spec = this.buildOpenApi3Spec(connName, options.gatewayUrl, definitions, options.scope);
        content = JSON.stringify(spec, null, 2);
        contentType = 'application/json; charset=utf-8';
        filename = `${safeName}-openapi3.json`;
        break;
      }
    }

    return { content, contentType, filename, apiCount: definitions.length };
  }

  async generateToolkitConfig(
    connectionId: string,
    tenantId: string,
    gatewayUrl: string
  ): Promise<ToolkitConfig> {
    const connName = await this.getConnectionName(connectionId, tenantId);
    const assignments = await assignmentService.listByConnection(connectionId, tenantId);
    const apiNames = assignments.map((a) => a.api_name);
    const safeName = connName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    return {
      name: `sap_dm_gw_${safeName}`,
      description: `SAP DM Gateway – ${apiNames.length > 0 ? apiNames.join(', ') : 'No APIs assigned'}`,
      headers: { 'X-API-Key': '<YOUR_GATEWAY_KEY>' },
      base_url: gatewayUrl,
      show_intermediate_steps: true,
    };
  }

  async listConnectionsWithExportMeta(
    userId: string,
    tenantId: string
  ): Promise<ConnectionExportMeta[]> {
    const { rows } = await pool.query<ConnectionExportMeta>(
      `SELECT c.id, c.name, c.sap_base_url, c.is_active,
              (c.agent_api_url IS NOT NULL AND c.agent_api_key_enc IS NOT NULL) AS has_agent_config,
              COALESCE(COUNT(a.id), 0)::int AS assigned_api_count
       FROM sap_connections c
       LEFT JOIN connection_api_assignments a
         ON a.sap_connection_id = c.id AND a.tenant_id = c.tenant_id
       WHERE c.user_id = $1 AND c.tenant_id = $2
       GROUP BY c.id
       ORDER BY c.name ASC`,
      [userId, tenantId]
    );
    return rows;
  }

  logExport(
    tenantId: string,
    userId: string,
    connectionId: string,
    format: string,
    scope: string,
    apiCount: number
  ): void {
    pool
      .query(
        `INSERT INTO export_logs (tenant_id, user_id, sap_connection_id, format, scope, api_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, userId, connectionId, format, scope, apiCount]
      )
      .catch((err) => console.error('Export log write failed:', err.message));
  }

  // ── Private helpers ─────────────────────────────────────

  private async getConnectionName(connectionId: string, tenantId: string): Promise<string> {
    const { rows } = await pool.query<{ name: string }>(
      'SELECT name FROM sap_connections WHERE id = $1 AND tenant_id = $2',
      [connectionId, tenantId]
    );
    if (rows.length === 0) throw new Error('Connection not found');
    return rows[0].name;
  }

  private async getAssignedDefinitions(
    connectionId: string,
    tenantId: string
  ): Promise<ApiDefinition[]> {
    const assignments = await assignmentService.listByConnection(connectionId, tenantId);
    const definitions: ApiDefinition[] = [];

    for (const a of assignments) {
      const def = await registryService.getById(a.api_definition_id, tenantId);
      if (def && def.is_active) {
        definitions.push(def);
      }
    }

    return definitions;
  }

  // ── OpenAPI 3.0 builder ─────────────────────────────────

  private buildOpenApi3Spec(
    connectionName: string,
    gatewayUrl: string,
    definitions: ApiDefinition[],
    scope: ExportScope
  ): Record<string, unknown> {
    const slugList = definitions.map((d) => `- **${d.slug}**: ${d.name} (${d.method} ${d.path})`).join('\n');

    const spec: Record<string, unknown> = {
      openapi: '3.0.3',
      info: {
        title: `SAP DM Gateway – ${connectionName}`,
        description:
          `API Gateway proxy for connection "${connectionName}".\n` +
          `All requests use POST /gw/query with X-API-Key authentication.\n\n` +
          `Available API slugs:\n${slugList}`,
        version: '1.0.0',
      },
      servers: [{ url: gatewayUrl, description: 'API Gateway' }],
      security: [{ ApiKeyAuth: [] }],
      paths: {} as Record<string, unknown>,
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'Gateway API key (sdmg_ prefix)',
          },
        },
        schemas: {} as Record<string, unknown>,
      },
    };

    const paths = spec.paths as Record<string, unknown>;
    const schemas = ((spec.components as Record<string, unknown>).schemas as Record<string, unknown>);

    // Build the orchestrated query endpoint
    if (scope === 'all') {
      paths['/gw/query'] = {
        post: this.buildQueryEndpoint(definitions),
      };
    }

    // Add per-slug schemas
    for (const def of definitions) {
      const key = this.sanitizeSchemaKey(def.slug);
      schemas[`${key}_call`] = this.buildCallSchema(def);

      if (def.response_schema?.status_codes) {
        const successSchema = def.response_schema.status_codes['200'] || def.response_schema.status_codes['default'];
        if (successSchema?.schema) {
          schemas[`${key}_response`] = successSchema.schema;
        }
      }
    }

    // Add OrchestratorResult schema
    schemas['OrchestratorResult'] = this.buildOrchestratorResultSchema();

    return spec;
  }

  private buildQueryEndpoint(definitions: ApiDefinition[]): Record<string, unknown> {
    const slugEnum = definitions.map((d) => d.slug);
    const callOneOf = definitions.map((d) => ({
      $ref: `#/components/schemas/${this.sanitizeSchemaKey(d.slug)}_call`,
    }));

    const examples: Record<string, unknown> = {};
    if (definitions.length > 0) {
      const first = definitions[0];
      const exampleParams: Record<string, string> = {};
      for (const p of first.query_params) {
        exampleParams[p.name] = p.example || p.default || `<${p.name}>`;
      }
      examples['single_call'] = {
        summary: `Call ${first.name}`,
        value: {
          calls: [{ slug: first.slug, params: exampleParams }],
          mode: 'parallel',
        },
      };

      if (definitions.length >= 2) {
        const second = definitions[1];
        const exampleParams2: Record<string, string> = {};
        for (const p of second.query_params) {
          exampleParams2[p.name] = p.example || p.default || `<${p.name}>`;
        }
        examples['multi_call'] = {
          summary: `Call ${first.name} and ${second.name}`,
          value: {
            calls: [
              { slug: first.slug, params: exampleParams },
              { slug: second.slug, params: exampleParams2 },
            ],
            mode: 'parallel',
          },
        };
      }
    }

    return {
      summary: 'Execute orchestrated API query',
      operationId: 'executeQuery',
      description:
        'Executes one or more SAP DM API calls through the gateway orchestrator.\n\n' +
        'Send an array of calls, each specifying an API slug and parameters. ' +
        'The gateway handles OAuth2 tokens, parallel/sequential execution, ' +
        'dependency resolution, and returns consolidated results.\n\n' +
        `Available slugs: ${slugEnum.join(', ')}`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['calls'],
              properties: {
                mode: {
                  type: 'string',
                  enum: ['parallel', 'sequential'],
                  default: 'parallel',
                  description:
                    'Execution mode. "parallel" runs all calls concurrently. ' +
                    '"sequential" resolves dependencies between calls.',
                },
                calls: {
                  type: 'array',
                  description: 'List of API calls to execute (max 20)',
                  maxItems: 20,
                  minItems: 1,
                  items:
                    callOneOf.length > 0
                      ? { oneOf: callOneOf }
                      : {
                          type: 'object',
                          required: ['slug'],
                          properties: {
                            slug: { type: 'string', enum: slugEnum },
                            params: { type: 'object', additionalProperties: { type: 'string' } },
                          },
                        },
                },
              },
            },
            ...(Object.keys(examples).length > 0 && { examples }),
          },
        },
      },
      responses: {
        '200': {
          description: 'Orchestration result with per-API responses',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OrchestratorResult' },
            },
          },
        },
        '400': { description: 'Invalid request (missing/invalid calls array)' },
        '401': { description: 'Missing or invalid API key' },
        '429': { description: 'Rate limit exceeded (100 req/min/token)' },
        '500': { description: 'Internal server error' },
      },
    };
  }

  private buildCallSchema(def: ApiDefinition): Record<string, unknown> {
    const properties: Record<string, unknown> = {
      slug: { type: 'string', const: def.slug, description: `API identifier for ${def.name}` },
    };
    const required = ['slug'];

    // Query params → params object
    if (def.query_params.length > 0) {
      const paramProps: Record<string, unknown> = {};
      const paramRequired: string[] = [];
      for (const p of def.query_params) {
        paramProps[p.name] = this.buildParamSchema(p);
        if (p.required) paramRequired.push(p.name);
      }
      properties.params = {
        type: 'object',
        description: 'Query parameters for this API call',
        properties: paramProps,
        ...(paramRequired.length > 0 && { required: paramRequired }),
      };
    }

    // Request headers
    if (def.request_headers.length > 0) {
      const headerProps: Record<string, unknown> = {};
      for (const h of def.request_headers) {
        headerProps[h.name] = this.buildParamSchema(h);
      }
      properties.headers = {
        type: 'object',
        description: 'Custom headers for this API call',
        properties: headerProps,
      };
    }

    // Request body
    if (def.request_body) {
      properties.body = {
        type: 'string',
        description: `JSON-encoded request body (Content-Type: ${def.request_body.content_type})`,
        ...(def.request_body.example != null ? { example: JSON.stringify(def.request_body.example) } : {}),
      };
    }

    return {
      type: 'object',
      description: `${def.name} – ${def.method} ${def.path}${def.description ? '\n' + def.description : ''}`,
      required,
      properties,
    };
  }

  private buildParamSchema(p: ParamDefinition): Record<string, unknown> {
    return {
      type: p.type || 'string',
      ...(p.description && { description: p.description }),
      ...(p.example && { example: p.example }),
      ...(p.default !== undefined && { default: p.default }),
    };
  }

  private buildOrchestratorResultSchema(): Record<string, unknown> {
    return {
      type: 'object',
      description: 'Consolidated orchestration result',
      properties: {
        totalDurationMs: { type: 'number', description: 'Total execution time in milliseconds' },
        mode: { type: 'string', enum: ['parallel', 'sequential'] },
        layers: {
          type: 'array',
          description: 'Execution layers (sequential mode only)',
          items: {
            type: 'object',
            properties: {
              layer: { type: 'integer' },
              slugs: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        results: {
          type: 'array',
          description: 'Per-API call results',
          items: {
            type: 'object',
            properties: {
              slug: { type: 'string' },
              status: { type: 'string', enum: ['fulfilled', 'rejected'] },
              statusCode: { type: 'integer' },
              responseBody: { type: 'object', description: 'API response data' },
              responseSizeBytes: { type: 'integer' },
              durationMs: { type: 'number' },
              error: { type: 'string' },
              layer: { type: 'integer' },
              injectedParams: {
                type: 'object',
                additionalProperties: { type: 'string' },
                description: 'Parameters injected from dependency resolution',
              },
            },
          },
        },
      },
    };
  }

  // ── Swagger 2.0 builder ─────────────────────────────────

  private buildSwagger2Spec(
    connectionName: string,
    gatewayUrl: string,
    definitions: ApiDefinition[],
    scope: ExportScope
  ): Record<string, unknown> {
    let host = '';
    let basePath = '/';
    const schemes: string[] = [];

    try {
      const url = new URL(gatewayUrl);
      host = url.host;
      basePath = url.pathname === '/' ? '/' : url.pathname;
      schemes.push(url.protocol.replace(':', ''));
    } catch {
      host = gatewayUrl;
      schemes.push('https');
    }

    const slugList = definitions.map((d) => `- ${d.slug}: ${d.name} (${d.method} ${d.path})`).join('\n');

    const spec: Record<string, unknown> = {
      swagger: '2.0',
      info: {
        title: `SAP DM Gateway – ${connectionName}`,
        description:
          `API Gateway proxy for connection "${connectionName}".\n\n` +
          `Available API slugs:\n${slugList}`,
        version: '1.0.0',
      },
      host,
      basePath,
      schemes,
      securityDefinitions: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Gateway API key (sdmg_ prefix)',
        },
      },
      security: [{ ApiKeyAuth: [] }],
      paths: {} as Record<string, unknown>,
      definitions: {} as Record<string, unknown>,
    };

    const paths = spec.paths as Record<string, unknown>;
    const defs = spec.definitions as Record<string, unknown>;

    if (scope === 'all') {
      paths['/gw/query'] = {
        post: this.buildSwagger2QueryEndpoint(definitions),
      };
    }

    for (const def of definitions) {
      const key = this.sanitizeSchemaKey(def.slug);
      defs[`${key}_call`] = this.buildCallSchema(def);

      if (def.response_schema?.status_codes) {
        const successSchema = def.response_schema.status_codes['200'] || def.response_schema.status_codes['default'];
        if (successSchema?.schema) {
          defs[`${key}_response`] = successSchema.schema;
        }
      }
    }

    defs['OrchestratorResult'] = this.buildOrchestratorResultSchema();

    return spec;
  }

  private buildSwagger2QueryEndpoint(definitions: ApiDefinition[]): Record<string, unknown> {
    const slugEnum = definitions.map((d) => d.slug);

    return {
      summary: 'Execute orchestrated API query',
      operationId: 'executeQuery',
      description:
        'Executes one or more SAP DM API calls through the gateway orchestrator.\n\n' +
        `Available slugs: ${slugEnum.join(', ')}`,
      consumes: ['application/json'],
      produces: ['application/json'],
      parameters: [
        {
          name: 'body',
          in: 'body',
          required: true,
          schema: {
            type: 'object',
            required: ['calls'],
            properties: {
              mode: {
                type: 'string',
                enum: ['parallel', 'sequential'],
                default: 'parallel',
              },
              calls: {
                type: 'array',
                maxItems: 20,
                items: {
                  type: 'object',
                  required: ['slug'],
                  properties: {
                    slug: { type: 'string', enum: slugEnum },
                    params: { type: 'object', additionalProperties: { type: 'string' } },
                    headers: { type: 'object', additionalProperties: { type: 'string' } },
                    body: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      ],
      responses: {
        '200': {
          description: 'Orchestration result',
          schema: { $ref: '#/definitions/OrchestratorResult' },
        },
        '400': { description: 'Invalid request' },
        '401': { description: 'Missing or invalid API key' },
        '429': { description: 'Rate limit exceeded' },
      },
    };
  }

  // ── Utilities ───────────────────────────────────────────

  private sanitizeSchemaKey(slug: string): string {
    return slug.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}

export const exportService = new ExportService();
