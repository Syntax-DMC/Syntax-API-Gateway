import { useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import type { Tenant } from '../types';

interface FormData {
  name: string;
  slug: string;
}

const emptyForm: FormData = { name: '', slug: '' };

export default function TenantsPage() {
  const { data: tenants, reload } = useApi<Tenant[]>('/api/tenants');
  const { t } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(true);
    setError('');
  }

  function openEdit(tenant: Tenant) {
    setForm({ name: tenant.name, slug: tenant.slug });
    setEditing(tenant.id);
    setShowForm(true);
    setError('');
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api(`/api/tenants/${editing}`, 'PATCH', form);
      } else {
        await api('/api/tenants', 'POST', form);
      }
      setShowForm(false);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(tenant: Tenant) {
    try {
      await api(`/api/tenants/${tenant.id}`, 'PATCH', { is_active: !tenant.is_active });
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function autoSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm((f) => ({
      ...f,
      [field]: val,
      ...(field === 'name' && !editing ? { slug: autoSlug(val) } : {}),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('tenants.title')}</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          {t('tenants.newTenant')}
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? t('tenants.editTenant') : t('tenants.newTenant')}</h2>
            {error && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{error}</div>}

            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('tenants.nameLabel')}</label>
              <input
                value={form.name}
                onChange={set('name')}
                placeholder="Haribo"
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('tenants.slugLabel')}</label>
              <input
                value={form.slug}
                onChange={set('slug')}
                placeholder="haribo"
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('tenants.slugHint')}</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">{t('common.cancel')}</button>
              <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? t('common.saving') : editing ? t('common.update') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-3 font-medium">{t('common.name')}</th>
                <th className="px-5 py-3 font-medium">{t('common.slug')}</th>
                <th className="px-5 py-3 font-medium">{t('tenants.usersColumn')}</th>
                <th className="px-5 py-3 font-medium">{t('common.status')}</th>
                <th className="px-5 py-3 font-medium">{t('tenants.created')}</th>
                <th className="px-5 py-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {!tenants?.length && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">{t('tenants.noTenants')}</td></tr>
              )}
              {tenants?.map((tn) => (
                <tr key={tn.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-5 py-3 text-gray-900 dark:text-white font-medium">{tn.name}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{tn.slug}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{tn.user_count}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${tn.is_active ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tn.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                      {tn.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-xs">{new Date(tn.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(tn)} className="px-2.5 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors">{t('common.edit')}</button>
                      <button onClick={() => handleToggleActive(tn)} className="px-2.5 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors">
                        {tn.is_active ? t('tenants.deactivate') : t('tenants.activate')}
                      </button>
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
