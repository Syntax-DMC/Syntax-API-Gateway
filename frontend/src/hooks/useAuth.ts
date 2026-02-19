import { createContext, useContext, useState, useCallback } from 'react';
import { api, setTokens, clearTokens, setOnAuthExpired } from '../api/client';
import type { AuthState, TenantMembership } from '../types';

export interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: string) => Promise<void>;
}

const emptyState: AuthState = {
  user: null,
  accessToken: null,
  memberships: [],
  activeTenantId: null,
  activeTenantRole: null,
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useAuthProvider(): AuthContextType {
  const [state, setState] = useState<AuthState>(emptyState);

  const logout = useCallback(() => {
    clearTokens();
    setState(emptyState);
  }, []);

  // Wire up auto-logout on 401
  setOnAuthExpired(logout);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; username: string; isSuperadmin: boolean };
      memberships: TenantMembership[];
      activeTenantId: string | null;
      activeTenantRole: 'admin' | 'user' | null;
    }>('/api/auth/login', 'POST', { username, password });

    setTokens(data.accessToken, data.refreshToken);
    setState({
      user: data.user,
      accessToken: data.accessToken,
      memberships: data.memberships,
      activeTenantId: data.activeTenantId,
      activeTenantRole: data.activeTenantRole,
    });
  }, []);

  const switchTenant = useCallback(async (tenantId: string) => {
    const data = await api<{
      accessToken: string;
      refreshToken: string;
      activeTenantId: string;
      activeTenantRole: 'admin' | 'user';
    }>('/api/auth/switch-tenant', 'POST', { tenantId });

    setTokens(data.accessToken, data.refreshToken);
    setState((prev) => ({
      ...prev,
      accessToken: data.accessToken,
      activeTenantId: data.activeTenantId,
      activeTenantRole: data.activeTenantRole,
    }));
  }, []);

  return { ...state, login, logout, switchTenant };
}
