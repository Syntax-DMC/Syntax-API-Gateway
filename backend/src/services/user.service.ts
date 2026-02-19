import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import { User } from '../types';

type UserPublic = Omit<User, 'password_hash'>;

type UserWithRole = UserPublic & { role: 'admin' | 'user' };

function toPublic(row: User): UserPublic {
  const { password_hash: _, ...rest } = row;
  return rest;
}

class UserService {
  async listByTenant(tenantId: string): Promise<UserWithRole[]> {
    const { rows } = await pool.query<User & { role: 'admin' | 'user' }>(
      `SELECT u.id, u.username, u.is_superadmin, u.is_active, u.created_at, u.updated_at, u.last_login_at, ut.role
       FROM users u
       JOIN user_tenants ut ON ut.user_id = u.id
       WHERE ut.tenant_id = $1
       ORDER BY u.created_at ASC`,
      [tenantId]
    );
    return rows.map((r) => {
      const { password_hash: _, ...rest } = r as User & { role: 'admin' | 'user' };
      return rest;
    });
  }

  async getById(id: string): Promise<UserPublic | null> {
    const { rows } = await pool.query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return rows.length > 0 ? toPublic(rows[0]) : null;
  }

  async create(data: {
    username: string;
    password: string;
    tenantId: string;
    role?: 'admin' | 'user';
    isSuperadmin?: boolean;
  }): Promise<UserPublic> {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<User>(
        `INSERT INTO users (username, password_hash, is_superadmin)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [data.username, passwordHash, data.isSuperadmin || false]
      );
      const user = rows[0];

      await client.query(
        `INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1, $2, $3)`,
        [user.id, data.tenantId, data.role || 'user']
      );

      await client.query('COMMIT');
      return toPublic(user);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    data: {
      username?: string;
      password?: string;
      is_active?: boolean;
      isSuperadmin?: boolean;
    }
  ): Promise<UserPublic | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.username !== undefined) {
      fields.push(`username = $${idx++}`);
      values.push(data.username);
    }
    if (data.password !== undefined) {
      fields.push(`password_hash = $${idx++}`);
      values.push(await bcrypt.hash(data.password, 12));
    }
    if (data.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(data.is_active);
    }
    if (data.isSuperadmin !== undefined) {
      fields.push(`is_superadmin = $${idx++}`);
      values.push(data.isSuperadmin);
    }

    if (fields.length === 0) return this.getById(id);

    fields.push(`updated_at = now()`);
    values.push(id);

    const { rows } = await pool.query<User>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows.length > 0 ? toPublic(rows[0]) : null;
  }

  async addToTenant(userId: string, tenantId: string, role: 'admin' | 'user' = 'user'): Promise<void> {
    await pool.query(
      `INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = $3, is_active = true`,
      [userId, tenantId, role]
    );
  }

  async removeFromTenant(userId: string, tenantId: string): Promise<void> {
    await pool.query(
      'UPDATE user_tenants SET is_active = false WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
  }

  async updateTenantRole(userId: string, tenantId: string, role: 'admin' | 'user'): Promise<void> {
    await pool.query(
      'UPDATE user_tenants SET role = $1 WHERE user_id = $2 AND tenant_id = $3',
      [role, userId, tenantId]
    );
  }

  async deactivate(id: string): Promise<UserPublic | null> {
    return this.update(id, { is_active: false });
  }
}

export const userService = new UserService();
