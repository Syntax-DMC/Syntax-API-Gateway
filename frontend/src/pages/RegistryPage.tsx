import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import type { ApiDefinition, ImportPreview, ImportResult } from '../types';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/10 text-green-400',
  POST: 'bg-blue-500/10 text-blue-400',
  PUT: 'bg-yellow-500/10 text-yellow-400',
  PATCH: 'bg-orange-500/10 text-orange-400',
  DELETE: 'bg-red-500/10 text-red-400',
};

interface CreateForm {
  slug: string;
  name: string;
  method: string;
  path: string;
  description: string;
  version: string;
  tags: string;
}

const emptyForm: CreateForm = {
  slug: '', name: '', method: 'GET', path: '', description: '', version: '1.0', tags: '',
};

export default function RegistryPage() {
  const navigate = useNavigate();
  const { user, activeTenantRole } = useAuth();
  const isAdmin = user?.isSuperadmin || activeTenantRole === 'admin';

  // Filters
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const queryParts: string[] = [];
  if (search) queryParts.push(`search=${encodeURIComponent(search)}`);
  if (methodFilter) queryParts.push(`method=${methodFilter}`);
  if (activeFilter) queryParts.push(`active=${activeFilter}`);
  const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const { data: definitions, reload } = useApi<ApiDefinition[]>(`/api/registry${queryStr}`, [search, methodFilter, activeFilter]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyForm);
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [specInput, setSpecInput] = useState('');
  const [importTags, setImportTags] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  // Create handlers
  async function handleCreate() {
    setSaving(true);
    setCreateError('');
    try {
      const tags = createForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      await api('/api/registry', 'POST', {
        ...createForm,
        tags,
        slug: createForm.slug || undefined,
      });
      setShowCreate(false);
      setCreateForm(emptyForm);
      reload();
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Import handlers
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSpecInput(reader.result as string);
    reader.readAsText(file);
  }

  async function handlePreview() {
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const tags = importTags.split(',').map(t => t.trim()).filter(Boolean);
      const result = await api<ImportPreview>('/api/registry/import', 'POST', {
        spec: specInput,
        tags,
        preview: true,
      });
      setImportPreview(result);
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportError('');
    try {
      const tags = importTags.split(',').map(t => t.trim()).filter(Boolean);
      const result = await api<ImportResult>('/api/registry/import', 'POST', {
        spec: specInput,
        tags,
      });
      setImportResult(result);
      setImportPreview(null);
      reload();
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function closeImport() {
    setShowImport(false);
    setSpecInput('');
    setImportTags('');
    setImportPreview(null);
    setImportResult(null);
    setImportError('');
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api(`/api/registry/${id}`, 'DELETE');
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const set = (field: keyof CreateForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setCreateForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">API Registry</h1>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors">
              Import OpenAPI
            </button>
            <button onClick={() => { setCreateForm(emptyForm); setCreateError(''); setShowCreate(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
              New Definition
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search name, slug, path..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={methodFilter}
          onChange={e => setMethodFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Methods</option>
          {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={activeFilter}
          onChange={e => setActiveFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-3 font-medium">Slug</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Method</th>
                <th className="px-5 py-3 font-medium">Path</th>
                <th className="px-5 py-3 font-medium">Tags</th>
                <th className="px-5 py-3 font-medium">Version</th>
                <th className="px-5 py-3 font-medium">Status</th>
                {isAdmin && <th className="px-5 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {!definitions?.length && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">No API definitions yet</td></tr>
              )}
              {definitions?.map(def => (
                <tr
                  key={def.id}
                  onClick={() => navigate(`/registry/${def.id}`)}
                  className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{def.slug}</td>
                  <td className="px-5 py-3 text-gray-900 dark:text-white font-medium">{def.name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLORS[def.method] || 'bg-gray-500/10 text-gray-400'}`}>
                      {def.method}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400 truncate max-w-[250px]">{def.path}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {def.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{tag}</span>
                      ))}
                      {def.tags.length > 3 && <span className="text-xs text-gray-400">+{def.tags.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-xs">{def.version}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${def.is_active ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${def.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                      {def.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(def.id, def.name)}
                        className="px-2.5 py-1 text-xs rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">New API Definition</h2>
            {createError && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{createError}</div>}

            <Field label="Name" value={createForm.name} onChange={set('name')} placeholder="Get Orders" />
            <Field label="Slug (auto-generated if empty)" value={createForm.slug} onChange={set('slug')} placeholder="get-orders" />
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Method</label>
              <select value={createForm.method} onChange={set('method')} className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <Field label="Path" value={createForm.path} onChange={set('path')} placeholder="/api/v1/orders" />
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Description</label>
              <textarea
                value={createForm.description}
                onChange={set('description')}
                rows={2}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Field label="Version" value={createForm.version} onChange={set('version')} placeholder="1.0" />
            <Field label="Tags (comma-separated)" value={createForm.tags} onChange={set('tags')} placeholder="orders, production" />

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !createForm.name || !createForm.path} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import OpenAPI Specification</h2>
            {importError && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{importError}</div>}

            {!importPreview && !importResult && (
              <>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Upload File</label>
                  <input
                    type="file"
                    accept=".json,.yaml,.yml"
                    onChange={handleFileUpload}
                    className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Or paste spec (JSON / YAML)</label>
                  <textarea
                    value={specInput}
                    onChange={e => setSpecInput(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder='{"openapi": "3.0.0", ...}'
                  />
                </div>
                <Field label="Additional Tags (comma-separated)" value={importTags} onChange={e => setImportTags(e.target.value)} placeholder="sap-dm, production" />
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={closeImport} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
                  <button onClick={handlePreview} disabled={importing || !specInput} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                    {importing ? 'Parsing...' : 'Preview'}
                  </button>
                </div>
              </>
            )}

            {importPreview && !importResult && (
              <>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-white">{importPreview.title}</span> v{importPreview.version} ({importPreview.spec_format}) — {importPreview.endpoints.length} endpoints
                </div>
                {importPreview.errors.length > 0 && (
                  <div className="text-yellow-400 text-xs bg-yellow-500/10 rounded-lg px-4 py-2">
                    {importPreview.errors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
                <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
                        <th className="px-3 py-2 font-medium">Method</th>
                        <th className="px-3 py-2 font-medium">Path</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.endpoints.map((ep, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="px-3 py-1.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${METHOD_COLORS[ep.method] || ''}`}>{ep.method}</span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">{ep.path}</td>
                          <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{ep.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => { setImportPreview(null); setImportError(''); }} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Back</button>
                  <button onClick={handleImport} disabled={importing} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                    {importing ? 'Importing...' : `Import ${importPreview.endpoints.length} Endpoints`}
                  </button>
                </div>
              </>
            )}

            {importResult && (
              <>
                <div className="space-y-2 text-sm">
                  <div className="text-green-400">Created: {importResult.created}</div>
                  {importResult.skipped > 0 && <div className="text-yellow-400">Skipped (duplicate slugs): {importResult.skipped}</div>}
                  {importResult.errors.length > 0 && (
                    <div className="text-red-400 text-xs bg-red-500/10 rounded-lg px-4 py-2">
                      {importResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={closeImport} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, type = 'text', ...props }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        {...props}
      />
    </div>
  );
}
