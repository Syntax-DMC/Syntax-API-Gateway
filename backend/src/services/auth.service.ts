import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool';
import { config } from '../config';
import { User, JwtPayload } from '../types';

export interface TenantMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: 'admin' | 'user';
}

export class AuthService {
  async login(username: string, password: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; username: string; isSuperadmin: boolean };
    memberships: TenantMembership[];
    activeTenantId: string | null;
    activeTenantRole: 'admin' | 'user' | null;
  }> {
    const { rows } = await pool.query<User>(
      'SELECT * FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (rows.length === 0) {
      throw new AuthError('Invalid credentials');
    }

    const user = rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      throw new AuthError('Invalid credentials');
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login_at = now() WHERE id = $1',
      [user.id]
    );

    // Get tenant memberships
    const memberships = await this.getMemberships(user.id);

    // Pick first active membership as default active tenant
    const activeMembership = memberships.length > 0 ? memberships[0] : null;

    const payload: JwtPayload = {
      userId: user.id,
      username: user.username,
      isSuperadmin: user.is_superadmin,
      activeTenantId: activeMembership?.tenantId ?? null,
      activeTenantRole: activeMembership?.role ?? null,
    };

    const accessToken = jwt.sign({ ...payload, jti: uuidv4() }, config.jwtSecret, {
      expiresIn: config.jwtAccessExpiry,
    } as SignOptions);

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh', jti: uuidv4() },
      config.jwtSecret,
      { expiresIn: config.jwtRefreshExpiry } as SignOptions
    );

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, isSuperadmin: user.is_superadmin },
      memberships,
      activeTenantId: activeMembership?.tenantId ?? null,
      activeTenantRole: activeMembership?.role ?? null,
    };
  }

  async refresh(refreshTokenStr: string): Promise<{
    accessToken: string;
    memberships: TenantMembership[];
    activeTenantId: string | null;
    activeTenantRole: 'admin' | 'user' | null;
  }> {
    try {
      const decoded = jwt.verify(refreshTokenStr, config.jwtSecret) as JwtPayload & { type?: string };

      if (decoded.type !== 'refresh') {
        throw new AuthError('Invalid token type');
      }

      // Verify user still exists and is active
      const { rows } = await pool.query<User>(
        'SELECT id, username, is_superadmin, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (rows.length === 0 || !rows[0].is_active) {
        throw new AuthError('User not found or inactive');
      }

      const user = rows[0];
      const memberships = await this.getMemberships(user.id);

      // Keep active tenant if still valid, otherwise fall back to first
      let activeTenantId = decoded.activeTenantId;
      let activeTenantRole = decoded.activeTenantRole;

      const stillValid = memberships.find((m) => m.tenantId === activeTenantId);
      if (!stillValid) {
        const fallback = memberships.length > 0 ? memberships[0] : null;
        activeTenantId = fallback?.tenantId ?? null;
        activeTenantRole = fallback?.role ?? null;
      } else {
        activeTenantRole = stillValid.role;
      }

      const payload: JwtPayload = {
        userId: user.id,
        username: user.username,
        isSuperadmin: user.is_superadmin,
        activeTenantId,
        activeTenantRole,
      };

      const accessToken = jwt.sign({ ...payload, jti: uuidv4() }, config.jwtSecret, {
        expiresIn: config.jwtAccessExpiry,
      } as SignOptions);

      return { accessToken, memberships, activeTenantId, activeTenantRole };
    } catch (err) {
      if (err instanceof AuthError) throw err;
      throw new AuthError('Invalid or expired refresh token');
    }
  }

  async switchTenant(userId: string, tenantId: string): Promise<{
    accessToken: string;
    refreshToken: string;
    activeTenantId: string;
    activeTenantRole: 'admin' | 'user';
  }> {
    // Verify user exists and is active
    const { rows: userRows } = await pool.query<User>(
      'SELECT id, username, is_superadmin FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );
    if (userRows.length === 0) throw new AuthError('User not found');

    const user = userRows[0];

    // Verify membership
    const { rows: memberRows } = await pool.query<{ role: 'admin' | 'user' }>(
      `SELECT ut.role FROM user_tenants ut
       JOIN tenants t ON t.id = ut.tenant_id
       WHERE ut.user_id = $1 AND ut.tenant_id = $2 AND ut.is_active = true AND t.is_active = true`,
      [userId, tenantId]
    );

    if (memberRows.length === 0) {
      throw new AuthError('Not a member of this tenant');
    }

    const activeTenantRole = memberRows[0].role;

    const payload: JwtPayload = {
      userId: user.id,
      username: user.username,
      isSuperadmin: user.is_superadmin,
      activeTenantId: tenantId,
      activeTenantRole,
    };

    const accessToken = jwt.sign({ ...payload, jti: uuidv4() }, config.jwtSecret, {
      expiresIn: config.jwtAccessExpiry,
    } as SignOptions);

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh', jti: uuidv4() },
      config.jwtSecret,
      { expiresIn: config.jwtRefreshExpiry } as SignOptions
    );

    return { accessToken, refreshToken, activeTenantId: tenantId, activeTenantRole };
  }

  async getMemberships(userId: string): Promise<TenantMembership[]> {
    const { rows } = await pool.query<{
      tenant_id: string;
      tenant_name: string;
      tenant_slug: string;
      role: 'admin' | 'user';
    }>(
      `SELECT ut.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug, ut.role
       FROM user_tenants ut
       JOIN tenants t ON t.id = ut.tenant_id
       WHERE ut.user_id = $1 AND ut.is_active = true AND t.is_active = true
       ORDER BY t.name ASC`,
      [userId]
    );

    return rows.map((r) => ({
      tenantId: r.tenant_id,
      tenantName: r.tenant_name,
      tenantSlug: r.tenant_slug,
      role: r.role,
    }));
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export const authService = new AuthService();
