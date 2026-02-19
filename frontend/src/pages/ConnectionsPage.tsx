import { useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import type { SapConnection } from '../types';

interface FormData {
  name: string;
  sapBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  agentApiUrl: string;
  agentApiKey: string;
}

const emptyForm: FormData = {
  name: '', sapBaseUrl: '', tokenUrl: '', clientId: '',
  clientSecret: '', agentApiUrl: '', agentApiKey: '',
};

export default function ConnectionsPage() {
  const { data: connections, reload } = useApi<SapConnection[]>('/api/connections');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, string | null>>({});

  function openCreate() {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(true);
    setError('');
  }

  function openEdit(conn: SapConnection) {
    setForm({
      name: conn.name,
      sapBaseUrl: conn.sap_base_url,
      tokenUrl: conn.token_url,
      clientId: conn.client_id,
      clientSecret: '',
      agentApiUrl: conn.agent_api_url || '',
      agentApiKey: '',
    });
    setEditing(conn.id);
    setShowForm(true);
    setError('');
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const body: Record<string, string | undefined> = { ...form };
      // Don't send empty secret fields on edit (means "no change")
      if (editing) {
        if (!body.clientSecret) delete body.clientSecret;
        if (!body.agentApiKey) delete body.agentApiKey;
      }
      if (!body.agentApiUrl) { delete body.agentApiUrl; delete body.agentApiKey; }

      if (editing) {
        await api(`/api/connections/${editing}`, 'PATCH', body);
      } else {
        await api('/api/connections', 'POST', body);
      }
      setShowForm(false);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? All associated tokens and logs will be permanently deleted.`)) return;
    try {
      await api(`/api/connections/${id}`, 'DELETE');
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleTest(id: string) {
    setTestResult(prev => ({ ...prev, [id]: 'testing...' }));
    try {
      await api(`/api/connections/${id}/test`, 'POST');
      setTestResult(prev => ({ ...prev, [id]: 'ok' }));
    } catch (err) {
      setTestResult(prev => ({ ...prev, [id]: (err as Error).message }));
    }
  }

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SAP Connections</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          New Connection
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edit Connection' : 'New Connection'}</h2>
            {error && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{error}</div>}

            <Field label="Name" value={form.name} onChange={set('name')} placeholder="Haribo Prod" />
            <Field label="SAP Base URL" value={form.sapBaseUrl} onChange={set('sapBaseUrl')} placeholder="https://api.eu20.dmc.cloud.sap" />
            <Field label="Token URL" value={form.tokenUrl} onChange={set('tokenUrl')} placeholder="https://...authentication.../oauth/token" />
            <Field label="Client ID" value={form.clientId} onChange={set('clientId')} />
            <Field label={editing ? 'Client Secret (leave empty to keep)' : 'Client Secret'} value={form.clientSecret} onChange={set('clientSecret')} type="password" required={!editing} />

            <hr className="border-gray-200 dark:border-gray-700" />
            <p className="text-xs text-gray-400 dark:text-gray-500">Agent configuration (optional)</p>
            <Field label="Agent API URL" value={form.agentApiUrl} onChange={set('agentApiUrl')} placeholder="https://studio-api.ai.syntax-rnd.com" />
            <Field label={editing ? 'Agent API Key (leave empty to keep)' : 'Agent API Key'} value={form.agentApiKey} onChange={set('agentApiKey')} type="password" />

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
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
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">SAP Base URL</th>
                <th className="px-5 py-3 font-medium">Agent</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!connections?.length && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">No connections yet</td></tr>
              )}
              {connections?.map(conn => (
                <tr key={conn.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-5 py-3 text-gray-900 dark:text-white font-medium">{conn.name}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs truncate max-w-[250px]">{conn.sap_base_url}</td>
                  <td className="px-5 py-3">
                    {conn.has_agent_config
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">Configured</span>
                      : <span className="text-xs text-gray-400 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${conn.is_active ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${conn.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                      {conn.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Btn onClick={() => handleTest(conn.id)}>
                        {testResult[conn.id] === 'testing...' ? '...' : testResult[conn.id] === 'ok' ? 'OK' : 'Test'}
                      </Btn>
                      <Btn onClick={() => openEdit(conn)}>Edit</Btn>
                      <Btn onClick={() => handleDelete(conn.id, conn.name)} danger>Delete</Btn>
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

function Field({ label, type = 'text', required, ...props }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        {...props}
      />
    </div>
  );
}

function Btn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
