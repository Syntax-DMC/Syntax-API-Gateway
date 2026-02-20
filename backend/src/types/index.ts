import { Request } from 'express';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserTenant {
  user_id: string;
  tenant_id: string;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: Date;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  is_superadmin: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface SapConnection {
  id: string;
  user_id: string;
  tenant_id: string;
  name: string;
  sap_base_url: string;
  token_url: string;
  client_id: string;
  client_secret_enc: string;
  agent_api_url: string | null;
  agent_api_key_enc: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ApiToken {
  id: string;
  user_id: string;
  tenant_id: string;
  sap_connection_id: string;
  token_hash: string;
  token_prefix: string;
  label: string;
  is_active: boolean;
  last_used_at: Date | null;
  request_count: number;
  created_at: Date;
  expires_at: Date | null;
}

export interface RequestLog {
  id: number;
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
  created_at: Date;
}

export interface JwtPayload {
  userId: string;
  username: string;
  isSuperadmin: boolean;
  activeTenantId: string | null;
  activeTenantRole: 'admin' | 'user' | null;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface TokenAuthenticatedRequest extends Request {
  apiToken?: ApiToken;
  sapConnection?: SapConnection;
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

export interface RequestBodyDef {
  content_type: string;
  schema?: Record<string, unknown>;
  example?: unknown;
}

export interface ResponseSchemaDef {
  status_codes: Record<string, { description?: string; schema?: Record<string, unknown> }>;
}

export interface DependencyDef {
  api_slug: string;
  field_mappings: { source: string; target: string }[];
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
  request_body: RequestBodyDef | null;
  response_schema: ResponseSchemaDef | null;
  provides: string[];
  depends_on: DependencyDef[];
  tags: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ApiDefinitionVersion {
  id: string;
  api_definition_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_summary: string | null;
  created_by: string | null;
  created_at: Date;
}

export interface ConnectionApiAssignment {
  id: string;
  sap_connection_id: string;
  api_definition_id: string;
  tenant_id: string;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
}

export interface ConnectionApiAssignmentWithConnection extends ConnectionApiAssignment {
  connection_name: string;
  sap_base_url: string;
  connection_is_active: boolean;
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

// ── Export types ──────────────────────────────────────────
export type ExportFormat = 'openapi3_json' | 'openapi3_yaml' | 'swagger2_json';
export type ExportScope = 'all' | 'assigned';

export interface ExportOptions {
  connectionId: string;
  tenantId: string;
  format: ExportFormat;
  scope: ExportScope;
  gatewayUrl: string;
}

export interface ExportLog {
  id: number;
  tenant_id: string;
  user_id: string;
  sap_connection_id: string;
  format: ExportFormat;
  scope: ExportScope;
  api_count: number;
  created_at: Date;
}

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
  created_at: Date;
  updated_at: Date;
}

export interface UseCaseExecutionResult {
  template_slug: string;
  template_name: string;
  totalDurationMs: number;
  mode: 'parallel' | 'sequential';
  context: Record<string, string>;
  results: OrchestratorCallResult[];
}

export interface UseCaseListItem {
  slug: string;
  name: string;
  description: string | null;
  required_context: UseCaseContextParam[];
  tags: string[];
  call_count: number;
  mode: 'parallel' | 'sequential';
}
