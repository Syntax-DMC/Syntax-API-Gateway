export interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  user_count: number;
  created_at: string;
  updated_at: string;
}

export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: 'admin' | 'user';
}

export interface User {
  id: string;
  username: string;
  is_superadmin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  role?: 'admin' | 'user';
}

export interface SapConnection {
  id: string;
  user_id: string;
  tenant_id: string;
  name: string;
  sap_base_url: string;
  token_url: string;
  client_id: string;
  agent_api_url: string | null;
  is_active: boolean;
  has_agent_config: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiToken {
  id: string;
  user_id: string;
  tenant_id: string;
  sap_connection_id: string;
  token_prefix: string;
  label: string;
  is_active: boolean;
  last_used_at: string | null;
  request_count: number;
  created_at: string;
  expires_at: string | null;
  connection_name?: string;
}

export interface RequestLog {
  id: string;
  api_token_id: string | null;
  sap_connection_id: string | null;
  direction: 'inbound' | 'outbound';
  target: 'agent' | 'sap_dm';
  method: string;
  path: string;
  request_headers: Record<string, string> | null;
  request_body_size: number | null;
  request_body: string | null;
  status_code: number | null;
  response_body_size: number | null;
  response_headers: Record<string, string> | null;
  response_body: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface LogListResponse {
  data: RequestLog[];
  total: number;
  page: number;
  pages: number;
}

export interface LogStats {
  totalRequests: number;
  byTarget: { agent: number; sap_dm: number };
  byStatus: { '2xx': number; '4xx': number; '5xx': number };
  avgDurationMs: { agent: number; sap_dm: number };
  topPaths: { path: string; count: number }[];
}

export interface ExplorerResult {
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseSizeBytes: number;
  durationMs: number;
  errorMessage?: string;
}

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
  created_at: string;
  updated_at: string;
}

export interface DiscoveredPath {
  method: string;
  path: string;
  count: number;
  last_used: string;
}

export interface AuthState {
  user: { id: string; username: string; isSuperadmin: boolean } | null;
  accessToken: string | null;
  memberships: TenantMembership[];
  activeTenantId: string | null;
  activeTenantRole: 'admin' | 'user' | null;
}

export interface ParamDefinition {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
  example?: string;
  context_var?: string;
}

export interface ApiDefinition {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  spec_format: 'openapi3' | 'swagger2' | 'manual';
  method: string;
  path: string;
  query_params: ParamDefinition[];
  request_headers: ParamDefinition[];
  request_body: { content_type: string; schema?: Record<string, unknown>; example?: unknown } | null;
  response_schema: { status_codes: Record<string, { description?: string; schema?: Record<string, unknown> }> } | null;
  provides: string[];
  depends_on: { api_slug: string; field_mappings: { source: string; target: string }[] }[];
  tags: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiDefinitionVersion {
  id: string;
  api_definition_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ImportPreview {
  title: string;
  version: string;
  spec_format: string;
  endpoints: Array<{
    slug: string;
    name: string;
    description?: string;
    method: string;
    path: string;
    tags: string[];
  }>;
  errors: string[];
}

export interface ImportResult {
  title: string;
  created: number;
  skipped: number;
  errors: string[];
}

export interface ConnectionApiAssignment {
  id: string;
  sap_connection_id: string;
  api_definition_id: string;
  tenant_id: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  connection_name: string;
  sap_base_url: string;
  connection_is_active: boolean;
}

export interface ExecutionLayer {
  layer: number;
  slugs: string[];
}

export interface ExecutionPlan {
  mode: 'parallel' | 'sequential';
  layers: ExecutionLayer[];
  resolvedSlugs: string[];
  unresolvedSlugs: string[];
  dependencyEdges: { from: string; to: string; mappings: { source: string; target: string }[] }[];
  warnings: string[];
  errors: string[];
}

export interface OrchestratorApiCall {
  slug: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
}

export interface OrchestratorCallResult {
  slug: string;
  status: 'fulfilled' | 'rejected';
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  responseSizeBytes?: number;
  durationMs?: number;
  error?: string;
  layer?: number;
  injectedParams?: Record<string, string>;
}

export interface OrchestratorResult {
  totalDurationMs: number;
  mode: 'parallel' | 'sequential';
  layers?: ExecutionLayer[];
  results: OrchestratorCallResult[];
}

// ── Export types ──────────────────────────────────────────
export type ExportFormat = 'openapi3_json' | 'openapi3_yaml' | 'swagger2_json';
export type ExportScope = 'all' | 'assigned';

export interface ConnectionExportMeta {
  id: string;
  name: string;
  sap_base_url: string;
  is_active: boolean;
  has_agent_config: boolean;
  assigned_api_count: number;
}

export interface ToolkitConfig {
  name: string;
  description: string;
  headers: Record<string, string>;
  base_url: string;
  show_intermediate_steps: boolean;
}

export interface ExportPreviewResponse {
  content: string;
  contentType: string;
  filename: string;
  apiCount: number;
}

// ── Use-Case Template types ──────────────────────────────
export interface UseCaseContextParam {
  name: string;
  type: string;
  description?: string;
  example?: string;
  required: boolean;
}

export interface UseCaseCallDef {
  slug: string;
  param_mapping: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
  description?: string;
}

export interface UseCaseTemplate {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  required_context: UseCaseContextParam[];
  calls: UseCaseCallDef[];
  mode: 'parallel' | 'sequential';
  tags: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
