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
