import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI, OpenAPIV3 } from 'openapi-types';
import { ResponseField } from '../types';

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
  response_fields: ResponseField[];
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

/**
 * Recursively flatten a response schema into a list of ResponseField objects.
 * Walks object properties (dot-path), arrays ([] notation), and emits leaf fields.
 */
export function flattenResponseSchema(schema: Record<string, unknown> | undefined): ResponseField[] {
  if (!schema) return [];
  const fields: ResponseField[] = [];
  const MAX_DEPTH = 10;

  function walk(node: Record<string, unknown>, prefix: string, depth: number): void {
    if (depth > MAX_DEPTH) return;

    const type = node.type as string | undefined;
    const description = node.description as string | undefined;

    if (type === 'object' || node.properties) {
      const props = node.properties as Record<string, Record<string, unknown>> | undefined;
      if (props) {
        for (const [key, prop] of Object.entries(props)) {
          const path = prefix ? `${prefix}.${key}` : key;
          walk(prop, path, depth + 1);
        }
      }
    } else if (type === 'array') {
      const items = node.items as Record<string, unknown> | undefined;
      if (items) {
        const arrayPath = prefix ? `${prefix}[]` : '[]';
        walk(items, arrayPath, depth + 1);
      }
    } else if (prefix) {
      // Leaf node (string, number, integer, boolean, or untyped)
      const leafType = type || 'string';
      const leafName = prefix.split('.').pop()!.replace(/\[\]$/, '');
      fields.push({ path: prefix, type: leafType, description, leaf_name: leafName });
    }
  }

  // Handle top-level arrays (e.g., response is an array of objects)
  if (schema.type === 'array' && schema.items) {
    walk(schema.items as Record<string, unknown>, '', 0);
  } else {
    walk(schema, '', 0);
  }

  return fields;
}

/**
 * Extract the base path from an OpenAPI 3.x server URL.
 * e.g. "https://api.{regionHost}/sfc/v2" → "/sfc/v2"
 */
function extractServerBasePath(doc: OpenAPIV3.Document): string {
  if (!doc.servers || doc.servers.length === 0) return '';
  const serverUrl = doc.servers[0].url;
  // Replace template variables so URL parsing works
  const cleaned = serverUrl.replace(/\{[^}]+\}/g, 'placeholder');
  try {
    const url = new URL(cleaned);
    return url.pathname.replace(/\/+$/, '') || '';
  } catch {
    // Relative URL fallback: extract path after host
    const match = serverUrl.match(/^https?:\/\/[^/]+(\/.*)/);
    if (match) return match[1].replace(/\/+$/, '');
    return '';
  }
}

/**
 * Safely strip circular references from an object so JSON.stringify won't throw.
 */
function stripCircular(obj: unknown): unknown {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value;
  }));
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
      parsed = await SwaggerParser.dereference(specObj as OpenAPI.Document, {
        dereference: { circular: 'ignore' },
      });
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

    // Extract base path from server URL (OpenAPI 3.x) or basePath (Swagger 2.0)
    const basePath = isV3
      ? extractServerBasePath(parsed as OpenAPIV3.Document)
      : (((parsed as Record<string, unknown>).basePath as string) || '').replace(/\/+$/, '');

    for (const [pathStr, pathItem] of Object.entries(paths)) {
      if (!pathItem) continue;
      const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
      const fullPath = basePath + pathStr;

      for (const method of methods) {
        const operation = (pathItem as Record<string, unknown>)[method] as OpenAPIV3.OperationObject | undefined;
        if (!operation) continue;

        try {
          // Use pathStr (without base) for slug generation, fullPath for stored path
          const endpoint = this.parseOperation(title, method, pathStr, fullPath, operation, pathItem as OpenAPIV3.PathItemObject);
          endpoints.push(endpoint);
        } catch (err) {
          errors.push(`${method.toUpperCase()} ${fullPath}: ${(err as Error).message}`);
        }
      }
    }

    return { title, version, spec_format, endpoints, errors };
  }

  private parseOperation(
    apiTitle: string,
    method: string,
    slugPath: string,
    storedPath: string,
    operation: OpenAPIV3.OperationObject,
    pathItem: OpenAPIV3.PathItemObject
  ): ParsedEndpoint {
    const slug = generateSlug(apiTitle, method, slugPath, operation.operationId);
    const name = operation.summary || operation.operationId || `${method.toUpperCase()} ${storedPath}`;
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

    // Flatten response schema into response_fields
    const cleanResponseSchema = response_schema ? stripCircular(response_schema) as ParsedEndpoint['response_schema'] : undefined;
    const successSchema = cleanResponseSchema?.status_codes?.['200']?.schema
      || cleanResponseSchema?.status_codes?.['201']?.schema;
    const response_fields = flattenResponseSchema(successSchema);

    return {
      slug,
      name,
      description,
      method: method.toUpperCase(),
      path: storedPath,
      query_params,
      request_headers,
      request_body: request_body ? stripCircular(request_body) as ParsedEndpoint['request_body'] : undefined,
      response_schema: cleanResponseSchema,
      response_fields,
      tags,
    };
  }
}

export const openApiParserService = new OpenApiParserService();
