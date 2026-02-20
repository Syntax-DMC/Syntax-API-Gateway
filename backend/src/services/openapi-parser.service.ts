import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI, OpenAPIV3 } from 'openapi-types';

interface ParsedParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
  example?: string;
  context_var?: string;
}

interface ParsedEndpoint {
  slug: string;
  name: string;
  description?: string;
  method: string;
  path: string;
  query_params: ParsedParam[];
  request_headers: ParsedParam[];
  request_body?: { content_type: string; schema?: Record<string, unknown>; example?: unknown };
  response_schema?: { status_codes: Record<string, { description?: string; schema?: Record<string, unknown> }> };
  tags: string[];
}

interface ParseResult {
  title: string;
  version: string;
  spec_format: 'openapi3' | 'swagger2';
  endpoints: ParsedEndpoint[];
  errors: string[];
}

// Context variable auto-mapping for common SAP DM parameters
const CONTEXT_VAR_MAP: Record<string, string> = {
  plant: '{{plant}}',
  sfc: '{{sfc}}',
  order: '{{order}}',
  material: '{{material}}',
  operation: '{{operation}}',
  resource: '{{resource}}',
  workcenter: '{{workcenter}}',
  routing: '{{routing}}',
  bom: '{{bom}}',
  batch: '{{batch}}',
};

function slugify(text: string): string {
  return text
    .replace(/[A-Z]/g, (c, i) => (i > 0 ? '-' : '') + c.toLowerCase())
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function generateSlug(apiTitle: string, method: string, path: string, operationId?: string): string {
  const prefix = slugify(apiTitle);
  let suffix: string;
  if (operationId) {
    suffix = slugify(operationId);
  } else {
    const pathSlug = path
      .replace(/\{[^}]+\}/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    suffix = `${method.toLowerCase()}-${pathSlug}`;
  }
  return `${prefix}-${suffix}`.slice(0, 150);
}

function detectContextVar(paramName: string): string | undefined {
  const lower = paramName.toLowerCase();
  return CONTEXT_VAR_MAP[lower];
}

function extractSchemaType(schema: OpenAPIV3.SchemaObject | undefined): string {
  if (!schema) return 'string';
  if (schema.type === 'array') return 'array';
  if (schema.type === 'integer' || schema.type === 'number') return schema.type;
  if (schema.type === 'boolean') return 'boolean';
  return 'string';
}

class OpenApiParserService {
  async parseSpec(specString: string): Promise<ParseResult> {
    const errors: string[] = [];
    let parsed: OpenAPI.Document;

    try {
      // Try JSON first, then YAML
      let specObj: unknown;
      try {
        specObj = JSON.parse(specString);
      } catch {
        // Try YAML - swagger-parser handles it natively
        specObj = specString;
      }
      parsed = await SwaggerParser.dereference(specObj as OpenAPI.Document);
    } catch (err) {
      return {
        title: 'Unknown',
        version: '1.0',
        spec_format: 'openapi3',
        endpoints: [],
        errors: [`Failed to parse spec: ${(err as Error).message}`],
      };
    }

    const isV3 = 'openapi' in parsed;
    const spec_format: 'openapi3' | 'swagger2' = isV3 ? 'openapi3' : 'swagger2';

    const info = (parsed as OpenAPIV3.Document).info || { title: 'Unknown', version: '1.0' };
    const title = info.title || 'Unknown';
    const version = info.version || '1.0';

    const endpoints: ParsedEndpoint[] = [];
    const paths = (parsed as OpenAPIV3.Document).paths || {};

    for (const [pathStr, pathItem] of Object.entries(paths)) {
      if (!pathItem) continue;
      const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

      for (const method of methods) {
        const operation = (pathItem as Record<string, unknown>)[method] as OpenAPIV3.OperationObject | undefined;
        if (!operation) continue;

        try {
          const endpoint = this.parseOperation(title, method, pathStr, operation, pathItem as OpenAPIV3.PathItemObject);
          endpoints.push(endpoint);
        } catch (err) {
          errors.push(`${method.toUpperCase()} ${pathStr}: ${(err as Error).message}`);
        }
      }
    }

    return { title, version, spec_format, endpoints, errors };
  }

  private parseOperation(
    apiTitle: string,
    method: string,
    path: string,
    operation: OpenAPIV3.OperationObject,
    pathItem: OpenAPIV3.PathItemObject
  ): ParsedEndpoint {
    const slug = generateSlug(apiTitle, method, path, operation.operationId);
    const name = operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`;
    const description = operation.description;
    const tags = operation.tags || [];

    // Merge path-level and operation-level parameters
    const allParams = [
      ...((pathItem.parameters || []) as OpenAPIV3.ParameterObject[]),
      ...((operation.parameters || []) as OpenAPIV3.ParameterObject[]),
    ];

    const query_params: ParsedParam[] = [];
    const request_headers: ParsedParam[] = [];

    for (const param of allParams) {
      if (!param.name) continue;
      const schema = param.schema as OpenAPIV3.SchemaObject | undefined;
      const parsed: ParsedParam = {
        name: param.name,
        type: extractSchemaType(schema),
        required: param.required || false,
        description: param.description,
        default: schema?.default !== undefined ? String(schema.default) : undefined,
        example: param.example !== undefined ? String(param.example) : undefined,
        context_var: detectContextVar(param.name),
      };

      if (param.in === 'query' || param.in === 'path') {
        query_params.push(parsed);
      } else if (param.in === 'header') {
        request_headers.push(parsed);
      }
    }

    // Parse request body
    let request_body: ParsedEndpoint['request_body'] | undefined;
    if (operation.requestBody) {
      const rb = operation.requestBody as OpenAPIV3.RequestBodyObject;
      const content = rb.content || {};
      const contentType = Object.keys(content)[0] || 'application/json';
      const mediaType = content[contentType];
      if (mediaType) {
        request_body = {
          content_type: contentType,
          schema: mediaType.schema as Record<string, unknown> | undefined,
          example: mediaType.example,
        };
      }
    }

    // Parse response schema
    let response_schema: ParsedEndpoint['response_schema'] | undefined;
    if (operation.responses) {
      const status_codes: Record<string, { description?: string; schema?: Record<string, unknown> }> = {};
      for (const [code, respObj] of Object.entries(operation.responses)) {
        const resp = respObj as OpenAPIV3.ResponseObject;
        const entry: { description?: string; schema?: Record<string, unknown> } = {
          description: resp.description,
        };
        if (resp.content) {
          const ct = Object.keys(resp.content)[0];
          if (ct && resp.content[ct]?.schema) {
            entry.schema = resp.content[ct].schema as Record<string, unknown>;
          }
        }
        status_codes[code] = entry;
      }
      response_schema = { status_codes };
    }

    return {
      slug,
      name,
      description,
      method: method.toUpperCase(),
      path,
      query_params,
      request_headers,
      request_body,
      response_schema,
      tags,
    };
  }
}

export const openApiParserService = new OpenApiParserService();
