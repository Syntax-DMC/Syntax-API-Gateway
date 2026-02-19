import { useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import type { User, Tenant } from '../types';

interface FormData {
  username: string;
  password: string;
  role: 'admin' | 'user';
}

const emptyForm: FormData = { username: '', password: '', role: 'user' };

export default function UsersPage() {
  const { user: me, activeTenantId, activeTenantRole } = useAuth();
  const isSuperadmin = me?.isSuperadmin ?? false;

  // Superadmin can filter by tenant
  const [filterTenantId, setFilterTenantId] = useState<string | null>(null);
  const { data: tenants } = useApi<Tenant[]>(isSuperadmin ? '/api/tenants' : null);

  const effectiveTenantId = isSuperadmin && filterTenantId ? filterTenantId : activeTenantId;
  const queryParam = isSuperadmin && filterTenantId ? `?tenantId=${filterTenantId}` : '';
  const { data: users, reload } = useApi<User[]>(`/api/users${queryParam}`, [effectiveTenantId]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Add-to-tenant modal state
  const [addTenantUserId, setAddTenantUserId] = useState<string | null>(null);
  const [addTenantId, setAddTenantId] = useState('');
  const [addTenantRole, setAddTenantRole] = useState<'admin' | 'user'>('user');

  function openCreate() {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(true);
    setError('');
  }

  function openEdit(user: User) {
    setForm({ username: user.username, password: '', role: user.role || 'user' });
    setEditing(user.id);
    setShowForm(true);
    setError('');
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const body: Record<string, unknown> = { role: form.role };
        if (form.username) body.username = form.username;
        if (form.password) body.password = form.password;
        await api(`/api/users/${editing}`, 'PATCH', body);
      } else {
        await api('/api/users', 'POST', {
          username: form.username,
          password: form.password,
          role: form.role,
        });
      }
      setShowForm(false);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(userId: string, username: string) {
    if (!confirm(`Deactivate user "${username}"?`)) return;
    try {
      await api(`/api/users/${userId}`, 'DELETE');
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleAddToTenant() {
    if (!addTenantUserId || !addTenantId) return;
    try {
      await api(`/api/users/${addTenantUserId}/tenants`, 'POST', {
        tenantId: addTenantId,
        role: addTenantRole,
      });
      setAddTenantUserId(null);
      setAddTenantId('');
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const isAdmin = isSuperadmin || activeTenantRole === 'admin';
  if (!isAdmin) return <p className="text-gray-400 dark:text-gray-500">Access denied</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          New User
        </button>
      </div>

      {/* Superadmin tenant filter */}
      {isSuperadmin && tenants && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500 dark:text-gray-400">Tenant:</label>
          <select
            value={filterTenantId || ''}
            onChange={(e) => setFilterTenantId(e.target.value || null)}
            className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Current tenant</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edit User' : 'New User'}</h2>
            {error && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{error}</div>}

            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                {editing ? 'Password (leave empty to keep)' : 'Password'}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Role in tenant</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'admin' | 'user' }))}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-to-tenant modal (superadmin only) */}
      {addTenantUserId && tenants && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add to Tenant</h2>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Tenant</label>
              <select
                value={addTenantId}
                onChange={(e) => setAddTenantId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Role</label>
              <select
                value={addTenantRole}
                onChange={(e) => setAddTenantRole(e.target.value as 'admin' | 'user')}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAddTenantUserId(null)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
              <button onClick={handleAddToTenant} disabled={!addTenantId} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-3 font-medium">Username</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Last Login</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!users?.length && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">No users</td></tr>
              )}
              {users?.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-5 py-3 text-gray-900 dark:text-white font-medium">
                    {u.username}
                    {u.is_superadmin && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">SA</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{u.role || '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${u.is_active ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(u)} className="px-2.5 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors">Edit</button>
                      {isSuperadmin && (
                        <button onClick={() => { setAddTenantUserId(u.id); setAddTenantId(''); }} className="px-2.5 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors">+ Tenant</button>
                      )}
                      {u.id !== me?.id && (
                        <button onClick={() => handleDeactivate(u.id, u.username)} className="px-2.5 py-1 text-xs rounded-md text-red-400 hover:bg-red-500/10 transition-colors">Deactivate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
