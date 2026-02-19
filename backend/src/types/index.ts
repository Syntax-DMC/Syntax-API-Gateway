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
