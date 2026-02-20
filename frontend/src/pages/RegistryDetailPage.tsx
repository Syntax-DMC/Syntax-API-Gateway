import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n';
import type { ApiDefinition, ApiDefinitionVersion, ParamDefinition, ConnectionApiAssignment, SapConnection, ExplorerResult } from '../types';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

interface TabDef {
  id: string;
  labelKey: TranslationKey;
}

const TABS: TabDef[] = [
  { id: 'Overview', labelKey: 'registryDetail.overview' },
  { id: 'Parameters', labelKey: 'registryDetail.parameters' },
  { id: 'Request Body', labelKey: 'registryDetail.requestBody' },
  { id: 'Response', labelKey: 'registryDetail.responseTab' },
  { id: 'Dependencies', labelKey: 'registryDetail.dependencies' },
  { id: 'Connections', labelKey: 'registryDetail.connectionsTab' },
  { id: 'Test', labelKey: 'registryDetail.test' },
  { id: 'History', labelKey: 'registryDetail.history' },
];
type Tab = string;

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/10 text-green-400',
  POST: 'bg-blue-500/10 text-blue-400',
  PUT: 'bg-yellow-500/10 text-yellow-400',
  PATCH: 'bg-orange-500/10 text-orange-400',
  DELETE: 'bg-red-500/10 text-red-400',
};

export default function RegistryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, activeTenantRole } = useAuth();
  const { t } = useI18n();
  const isAdmin = user?.isSuperadmin || activeTenantRole === 'admin';

  const { data: def, reload, setData } = useApi<ApiDefinition>(id ? `/api/registry/${id}` : null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startEdit() {
    if (!def) return;
    setDraft({
      name: def.name,
      slug: def.slug,
      description: def.description || '',
      version: def.version,
      method: def.method,
      path: def.path,
      spec_format: def.spec_format,
      tags: def.tags.join(', '),
      provides: def.provides.join(', '),
      is_active: def.is_active,
      query_params: def.query_params,
      request_headers: def.request_headers,
      request_body: def.request_body ? JSON.stringify(def.request_body, null, 2) : '',
      response_schema: def.response_schema ? JSON.stringify(def.response_schema, null, 2) : '',
      depends_on: def.depends_on ? JSON.stringify(def.depends_on, null, 2) : '[]',
    });
    setEditing(true);
    setError('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: draft.name,
        slug: draft.slug,
        description: draft.description || null,
        version: draft.version,
        method: draft.method,
        path: draft.path,
        spec_format: draft.spec_format,
        tags: (draft.tags as string).split(',').map((s: string) => s.trim()).filter(Boolean),
        provides: (draft.provides as string).split(',').map((s: string) => s.trim()).filter(Boolean),
        is_active: draft.is_active,
        query_params: draft.query_params,
        request_headers: draft.request_headers,
      };

      // Parse JSON fields
      if (draft.request_body) {
        try { payload.request_body = JSON.parse(draft.request_body as string); } catch { throw new Error(t('registryDetail.invalidRequestBody')); }
      } else {
        payload.request_body = null;
      }
      if (draft.response_schema) {
        try { payload.response_schema = JSON.parse(draft.response_schema as string); } catch { throw new Error(t('registryDetail.invalidResponseSchema')); }
      } else {
        payload.response_schema = null;
      }
      if (draft.depends_on) {
        try { payload.depends_on = JSON.parse(draft.depends_on as string); } catch { throw new Error(t('registryDetail.invalidDependsOn')); }
      }

      const updated = await api<ApiDefinition>(`/api/registry/${id}`, 'PATCH', payload);
      setData(updated);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(false);
    setError('');
  }

  if (!def) {
    return <div className="text-gray-400 dark:text-gray-500">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/registry')} className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{def.name}</h1>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">v{def.version}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLORS[def.method] || ''}`}>{def.method}</span>
            </div>
            <div className="text-sm font-mono text-gray-500 dark:text-gray-400 mt-1">{def.slug}</div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={cancelEdit} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">{t('common.cancel')}</button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </>
            ) : (
              <button onClick={startEdit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">{t('common.edit')}</button>
            )}
          </div>
        )}
      </div>

      {error && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{error}</div>}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-6">
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === tb.id
                  ? 'border-blue-500 text-blue-500'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {t(tb.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        {tab === 'Overview' && <OverviewTab def={def} editing={editing} draft={draft} setDraft={setDraft} />}
        {tab === 'Parameters' && <ParametersTab def={def} editing={editing} draft={draft} setDraft={setDraft} />}
        {tab === 'Request Body' && <RequestBodyTab def={def} editing={editing} draft={draft} setDraft={setDraft} />}
        {tab === 'Response' && <ResponseTab def={def} editing={editing} draft={draft} setDraft={setDraft} />}
        {tab === 'Dependencies' && <DependenciesTab def={def} editing={editing} draft={draft} setDraft={setDraft} />}
        {tab === 'Connections' && <ConnectionsTab defId={def.id} isAdmin={isAdmin} />}
        {tab === 'Test' && <TestTab def={def} />}
        {tab === 'History' && <HistoryTab defId={def.id} isAdmin={isAdmin} onReverted={reload} />}
      </div>
    </div>
  );
}

// ── Overview Tab ──
function OverviewTab({ def, editing, draft, setDraft }: {
  def: ApiDefinition; editing: boolean; draft: Record<string, unknown>; setDraft: (d: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  if (editing) {
    return (
      <div className="space-y-4">
        <EditField label={t('registryDetail.nameLabel')} value={draft.name as string} onChange={v => setDraft({ ...draft, name: v })} />
        <EditField label={t('registryDetail.slugLabel')} value={draft.slug as string} onChange={v => setDraft({ ...draft, slug: v })} />
        <div>
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('registryDetail.descriptionLabel')}</label>
          <textarea
            value={draft.description as string}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('common.method')}</label>
            <select
              value={draft.method as string}
              onChange={e => setDraft({ ...draft, method: e.target.value })}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <EditField label={t('common.path')} value={draft.path as string} onChange={v => setDraft({ ...draft, path: v })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <EditField label={t('registryDetail.versionLabel')} value={draft.version as string} onChange={v => setDraft({ ...draft, version: v })} />
          <div>
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('registryDetail.specFormat')}</label>
            <select
              value={draft.spec_format as string}
              onChange={e => setDraft({ ...draft, spec_format: e.target.value })}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="manual">Manual</option>
              <option value="openapi3">OpenAPI 3</option>
              <option value="swagger2">Swagger 2</option>
            </select>
          </div>
        </div>
        <EditField label={t('registryDetail.tagsLabel')} value={draft.tags as string} onChange={v => setDraft({ ...draft, tags: v })} />
        <EditField label={t('registryDetail.providesLabel')} value={draft.provides as string} onChange={v => setDraft({ ...draft, provides: v })} />
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">{t('registryDetail.activeToggle')}</label>
          <button
            onClick={() => setDraft({ ...draft, is_active: !draft.is_active })}
            className={`w-10 h-5 rounded-full transition-colors ${draft.is_active ? 'bg-blue-600' : 'bg-gray-400'}`}
          >
            <span className={`block w-4 h-4 rounded-full bg-white transform transition-transform ${draft.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <InfoRow label={t('registryDetail.nameLabel')} value={def.name} />
      <InfoRow label={t('registryDetail.slugLabel')} value={def.slug} mono />
      <InfoRow label={t('registryDetail.descriptionLabel')} value={def.description || '—'} />
      <InfoRow label={t('registryDetail.methodPath')} value={`${def.method} ${def.path}`} mono />
      <InfoRow label={t('registryDetail.versionLabel')} value={def.version} />
      <InfoRow label={t('registryDetail.specFormat')} value={def.spec_format} />
      <div>
        <span className="text-sm text-gray-500 dark:text-gray-400">{t('registryDetail.tagsLabel')}</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {def.tags.length > 0
            ? def.tags.map(tag => <span key={tag} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{tag}</span>)
            : <span className="text-sm text-gray-400">—</span>}
        </div>
      </div>
      <div>
        <span className="text-sm text-gray-500 dark:text-gray-400">{t('registryDetail.providesLabel')}</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {def.provides.length > 0
            ? def.provides.map(p => <span key={p} className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">{p}</span>)
            : <span className="text-sm text-gray-400">—</span>}
        </div>
      </div>
      <InfoRow label={t('registryDetail.statusLabel')} value={def.is_active ? t('common.active') : t('common.inactive')} />
      <InfoRow label={t('registryDetail.createdLabel')} value={new Date(def.created_at).toLocaleString()} />
      <InfoRow label={t('registryDetail.updatedLabel')} value={new Date(def.updated_at).toLocaleString()} />
    </div>
  );
}

// ── Parameters Tab ──
function ParametersTab({ def, editing, draft, setDraft }: {
  def: ApiDefinition; editing: boolean; draft: Record<string, unknown>; setDraft: (d: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  function updateParam(type: 'query_params' | 'request_headers', idx: number, field: string, value: unknown) {
    const params = [...(draft[type] as ParamDefinition[])];
    params[idx] = { ...params[idx], [field]: value };
    setDraft({ ...draft, [type]: params });
  }

  function addParam(type: 'query_params' | 'request_headers') {
    const params = [...(draft[type] as ParamDefinition[])];
    params.push({ name: '', type: 'string', required: false });
    setDraft({ ...draft, [type]: params });
  }

  function removeParam(type: 'query_params' | 'request_headers', idx: number) {
    const params = [...(draft[type] as ParamDefinition[])];
    params.splice(idx, 1);
    setDraft({ ...draft, [type]: params });
  }

  function renderParamTable(label: string, type: 'query_params' | 'request_headers', params: ParamDefinition[]) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</h3>
          {editing && (
            <button onClick={() => addParam(type)} className="text-xs text-blue-500 hover:text-blue-400">+ Add</button>
          )}
        </div>
        {params.length === 0 ? (
          <div className="text-sm text-gray-400 dark:text-gray-500">{t('registryDetail.noParameters')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 font-medium">{t('common.name')}</th>
                  <th className="px-3 py-2 font-medium">{t('registryDetail.typeColumn')}</th>
                  <th className="px-3 py-2 font-medium">{t('registryDetail.requiredColumn')}</th>
                  <th className="px-3 py-2 font-medium">{t('common.description')}</th>
                  <th className="px-3 py-2 font-medium">{t('registryDetail.exampleColumn')}</th>
                  <th className="px-3 py-2 font-medium">{t('registryDetail.contextVar')}</th>
                  {editing && <th className="px-3 py-2 font-medium"></th>}
                </tr>
              </thead>
              <tbody>
                {params.map((p, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    {editing ? (
                      <>
                        <td className="px-3 py-1.5"><MiniInput value={p.name} onChange={v => updateParam(type, i, 'name', v)} /></td>
                        <td className="px-3 py-1.5">
                          <select value={p.type} onChange={e => updateParam(type, i, 'type', e.target.value)}
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-xs">
                            <option>string</option><option>integer</option><option>number</option><option>boolean</option><option>array</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <input type="checkbox" checked={p.required} onChange={e => updateParam(type, i, 'required', e.target.checked)} />
                        </td>
                        <td className="px-3 py-1.5"><MiniInput value={p.description || ''} onChange={v => updateParam(type, i, 'description', v)} /></td>
                        <td className="px-3 py-1.5"><MiniInput value={p.example || ''} onChange={v => updateParam(type, i, 'example', v)} /></td>
                        <td className="px-3 py-1.5"><MiniInput value={p.context_var || ''} onChange={v => updateParam(type, i, 'context_var', v)} placeholder="{{var}}" /></td>
                        <td className="px-3 py-1.5">
                          <button onClick={() => removeParam(type, i)} className="text-red-400 hover:text-red-300">x</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-white">{p.name}</td>
                        <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{p.type}</td>
                        <td className="px-3 py-1.5 text-center">{p.required ? <span className="text-red-400">*</span> : '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{p.description || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 font-mono">{p.example || '—'}</td>
                        <td className="px-3 py-1.5 text-blue-400 font-mono">{p.context_var || '—'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const qp = editing ? (draft.query_params as ParamDefinition[]) : def.query_params;
  const rh = editing ? (draft.request_headers as ParamDefinition[]) : def.request_headers;

  return (
    <div className="space-y-6">
      {renderParamTable(t('registryDetail.queryPathParams'), 'query_params', qp)}
      {renderParamTable(t('registryDetail.requestHeaders'), 'request_headers', rh)}
    </div>
  );
}

// ── Request Body Tab ──
function RequestBodyTab({ def, editing, draft, setDraft }: {
  def: ApiDefinition; editing: boolean; draft: Record<string, unknown>; setDraft: (d: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  if (editing) {
    return (
      <div className="space-y-2">
        <label className="block text-sm text-gray-500 dark:text-gray-400">{t('registryDetail.requestBodyJson')}</label>
        <textarea
          value={draft.request_body as string}
          onChange={e => setDraft({ ...draft, request_body: e.target.value })}
          rows={15}
          className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder='{"content_type": "application/json", "schema": {...}, "example": {...}}'
        />
      </div>
    );
  }

  if (!def.request_body) {
    return <div className="text-sm text-gray-400 dark:text-gray-500">{t('registryDetail.noRequestBody')}</div>;
  }

  return (
    <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-auto max-h-96 font-mono">
      {JSON.stringify(def.request_body, null, 2)}
    </pre>
  );
}

// ── Response Tab ──
function ResponseTab({ def, editing, draft, setDraft }: {
  def: ApiDefinition; editing: boolean; draft: Record<string, unknown>; setDraft: (d: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  if (editing) {
    return (
      <div className="space-y-2">
        <label className="block text-sm text-gray-500 dark:text-gray-400">{t('registryDetail.responseSchema')}</label>
        <textarea
          value={draft.response_schema as string}
          onChange={e => setDraft({ ...draft, response_schema: e.target.value })}
          rows={15}
          className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder='{"status_codes": {"200": {"description": "OK", "schema": {...}}}}'
        />
      </div>
    );
  }

  if (!def.response_schema) {
    return <div className="text-sm text-gray-400 dark:text-gray-500">{t('registryDetail.noResponseSchema')}</div>;
  }

  return (
    <pre className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-auto max-h-96 font-mono">
      {JSON.stringify(def.response_schema, null, 2)}
    </pre>
  );
}

// ── Dependencies Tab ──
function DependenciesTab({ def, editing, draft, setDraft }: {
  def: ApiDefinition; editing: boolean; draft: Record<string, unknown>; setDraft: (d: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  if (editing) {
    return (
      <div className="space-y-2">
        <label className="block text-sm text-gray-500 dark:text-gray-400">{t('registryDetail.dependenciesJson')}</label>
        <textarea
          value={draft.depends_on as string}
          onChange={e => setDraft({ ...draft, depends_on: e.target.value })}
          rows={10}
          className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder='[{"api_slug": "get-plants", "field_mappings": [{"source": "$.plant", "target": "plant"}]}]'
        />
      </div>
    );
  }

  if (!def.depends_on || def.depends_on.length === 0) {
    return <div className="text-sm text-gray-400 dark:text-gray-500">{t('registryDetail.noDependencies')}</div>;
  }

  return (
    <div className="space-y-3">
      {def.depends_on.map((dep, i) => (
        <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="text-sm font-mono text-blue-400 mb-2">{dep.api_slug}</div>
          {dep.field_mappings.length > 0 && (
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-400 dark:text-gray-500">
                  <th className="text-left py-1">{t('registryDetail.source')}</th>
                  <th className="text-left py-1">{t('common.target')}</th>
                </tr>
              </thead>
              <tbody>
                {dep.field_mappings.map((fm, j) => (
                  <tr key={j} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="py-1 font-mono text-gray-600 dark:text-gray-400">{fm.source}</td>
                    <td className="py-1 font-mono text-gray-600 dark:text-gray-400">{fm.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

// ── History Tab ──
function HistoryTab({ defId, isAdmin, onReverted }: { defId: string; isAdmin: boolean; onReverted: () => void }) {
  const { t } = useI18n();
  const { data: versions } = useApi<ApiDefinitionVersion[]>(`/api/registry/${defId}/versions`);
  const [reverting, setReverting] = useState<number | null>(null);

  async function handleRevert(versionNum: number) {
    if (!confirm(t('registryDetail.revertConfirm', { version: versionNum }))) return;
    setReverting(versionNum);
    try {
      await api(`/api/registry/${defId}/revert/${versionNum}`, 'POST');
      onReverted();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setReverting(null);
    }
  }

  if (!versions || versions.length === 0) {
    return <div className="text-sm text-gray-400 dark:text-gray-500">{t('registryDetail.noHistory')}</div>;
  }

  return (
    <div className="space-y-2">
      {versions.map(v => (
        <div key={v.id} className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">{t('registryDetail.versionNumber', { num: v.version_number })}</span>
            {v.change_summary && <span className="text-sm text-gray-500 dark:text-gray-400 ml-3">{v.change_summary}</span>}
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{new Date(v.created_at).toLocaleString()}</div>
          </div>
          {isAdmin && (
            <button
              onClick={() => handleRevert(v.version_number)}
              disabled={reverting === v.version_number}
              className="px-3 py-1 text-xs text-blue-500 hover:bg-blue-500/10 rounded-md transition-colors disabled:opacity-50"
            >
              {reverting === v.version_number ? t('registryDetail.reverting') : t('registryDetail.revert')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Connections Tab ──
function ConnectionsTab({ defId, isAdmin }: { defId: string; isAdmin: boolean }) {
  const { t } = useI18n();
  const { data: assignments, reload } = useApi<ConnectionApiAssignment[]>(`/api/registry/${defId}/assignments`);
  const { data: connections } = useApi<SapConnection[]>('/api/connections');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');

  const assignedIds = new Set(assignments?.map(a => a.sap_connection_id) || []);
  const availableConnections = connections?.filter(c => !assignedIds.has(c.id)) || [];

  async function handleAssign() {
    if (!selectedConnectionId) return;
    setAssigning(true);
    setError('');
    try {
      await api(`/api/registry/${defId}/assignments`, 'POST', { connectionId: selectedConnectionId });
      setSelectedConnectionId('');
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(assignmentId: string, connectionName: string) {
    if (!confirm(t('registryDetail.removeAssignmentConfirm', { name: connectionName }))) return;
    try {
      await api(`/api/registry/${defId}/assignments/${assignmentId}`, 'DELETE');
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('registryDetail.assignedConnections', { count: assignments?.length || 0 })}
      </h3>

      {error && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{error}</div>}

      {isAdmin && availableConnections.length > 0 && (
        <div className="flex gap-2 items-center">
          <select
            value={selectedConnectionId}
            onChange={e => setSelectedConnectionId(e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
          >
            <option value="">{t('registryDetail.selectAConnection')}</option>
            {availableConnections.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.sap_base_url})</option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={!selectedConnectionId || assigning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {assigning ? t('registryDetail.assigning') : t('registryDetail.assign')}
          </button>
        </div>
      )}

      {(!assignments || assignments.length === 0) ? (
        <div className="text-sm text-gray-400 dark:text-gray-500">
          {t('registryDetail.noConnectionsAssigned')}
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map(a => (
            <div key={a.id} className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{a.connection_name}</div>
                <div className="text-xs font-mono text-gray-500 dark:text-gray-400">{a.sap_base_url}</div>
                <span className={`inline-flex items-center gap-1 text-xs mt-1 ${a.connection_is_active ? 'text-green-400' : 'text-red-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${a.connection_is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                  {a.connection_is_active ? t('common.active') : t('common.inactive')}
                </span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleUnassign(a.id, a.connection_name)}
                  className="px-3 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                >
                  {t('common.remove')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Test Tab ──
function TestTab({ def }: { def: ApiDefinition }) {
  const { t } = useI18n();
  const { data: assignments } = useApi<ConnectionApiAssignment[]>(`/api/registry/${def.id}/assignments`);

  const [connectionId, setConnectionId] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [bodyStr, setBodyStr] = useState('');
  const [result, setResult] = useState<ExplorerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [responseTab, setResponseTab] = useState<'body' | 'headers'>('body');

  // Initialize body from definition example
  useEffect(() => {
    if (def.request_body?.example) {
      setBodyStr(JSON.stringify(def.request_body.example, null, 2));
    }
  }, [def.request_body]);

  // Initialize param values from definition examples
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const qp of def.query_params) {
      initial[qp.name] = qp.example || qp.default || '';
    }
    setParamValues(initial);
  }, [def.query_params]);

  const activeAssignments = assignments?.filter(a => a.connection_is_active) || [];

  async function handleSend() {
    if (!connectionId) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const headers = Object.fromEntries(
        Object.entries(headerValues).filter(([k, v]) => k.trim() && v.trim())
      );
      const res = await api<ExplorerResult>(`/api/registry/${def.id}/test`, 'POST', {
        connectionId,
        params: paramValues,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: bodyStr.trim() || undefined,
      });
      setResult(res);
      setResponseTab('body');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!assignments) {
    return <div className="text-gray-400 text-sm">{t('common.loading')}</div>;
  }

  if (activeAssignments.length === 0) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
        {t('registryDetail.noActiveConnections')}
      </div>
    );
  }

  // Build preview path
  let previewPath = def.path;
  for (const [key, value] of Object.entries(paramValues)) {
    previewPath = previewPath.replace(`{${key}}`, value || `{${key}}`);
  }
  const queryParts = def.query_params
    .filter(qp => paramValues[qp.name] && !def.path.includes(`{${qp.name}}`))
    .map(qp => `${qp.name}=${paramValues[qp.name]}`);
  if (queryParts.length > 0) {
    previewPath += (previewPath.includes('?') ? '&' : '?') + queryParts.join('&');
  }

  return (
    <div className="space-y-4">
      {/* Connection picker + Send */}
      <div className="flex gap-2">
        <select
          value={connectionId}
          onChange={e => setConnectionId(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
        >
          <option value="">{t('registryDetail.selectConnection')}</option>
          {activeAssignments.map(a => (
            <option key={a.sap_connection_id} value={a.sap_connection_id}>
              {a.connection_name}
            </option>
          ))}
        </select>
        <button
          onClick={handleSend}
          disabled={!connectionId || loading}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            connectionId && !loading
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          {loading ? t('common.sending') : t('common.send')}
        </button>
      </div>

      {/* Preview path */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-2 ${METHOD_COLORS[def.method] || ''}`}>
          {def.method}
        </span>
        <span className="text-sm font-mono text-gray-600 dark:text-gray-300">{previewPath}</span>
      </div>

      {/* Parameters */}
      {def.query_params.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('registryDetail.parametersLabel')}</h4>
          {def.query_params.map(qp => (
            <div key={qp.name} className="flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 w-32 shrink-0 font-mono">
                {qp.name}{qp.required ? ' *' : ''}
              </label>
              <input
                type="text"
                value={paramValues[qp.name] || ''}
                onChange={e => setParamValues(prev => ({ ...prev, [qp.name]: e.target.value }))}
                placeholder={qp.example || qp.description || ''}
                className="flex-1 px-2 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-sm font-mono"
              />
            </div>
          ))}
        </div>
      )}

      {/* Request Headers */}
      {def.request_headers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('registryDetail.headersLabel')}</h4>
          {def.request_headers.map(rh => (
            <div key={rh.name} className="flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 w-32 shrink-0 font-mono">
                {rh.name}{rh.required ? ' *' : ''}
              </label>
              <input
                type="text"
                value={headerValues[rh.name] || ''}
                onChange={e => setHeaderValues(prev => ({ ...prev, [rh.name]: e.target.value }))}
                placeholder={rh.example || rh.description || ''}
                className="flex-1 px-2 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-sm font-mono"
              />
            </div>
          ))}
        </div>
      )}

      {/* Request Body */}
      {['POST', 'PUT', 'PATCH'].includes(def.method) && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('registryDetail.requestBodyLabel')}</h4>
          <textarea
            value={bodyStr}
            onChange={e => setBodyStr(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono text-xs"
            placeholder='{"json": "body"}'
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Response */}
      {result && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('common.response')}</span>
            <StatusBadge code={result.statusCode} />
            <span className="text-sm text-gray-500 dark:text-gray-400">{result.durationMs}ms</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{formatBytes(result.responseSizeBytes)}</span>
            {result.errorMessage && (
              <span className="text-sm text-red-400 ml-auto">{result.errorMessage}</span>
            )}
          </div>
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70">
            <button onClick={() => setResponseTab('body')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${responseTab === 'body' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {t('common.body')}
            </button>
            <button onClick={() => setResponseTab('headers')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${responseTab === 'headers' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {t('common.headers')} ({Object.keys(result.responseHeaders).length})
            </button>
          </div>
          <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30">
            {responseTab === 'body' && <BodyBlock body={result.responseBody} />}
            {responseTab === 'headers' && <ResponseHeadersTable headers={result.responseHeaders} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Test tab helper components ──
function StatusBadge({ code }: { code: number }) {
  const color = code < 300 ? 'bg-green-900/50 text-green-400' : code < 500 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-red-900/50 text-red-400';
  return <span className={`px-2 py-0.5 rounded text-sm font-mono ${color}`}>{code}</span>;
}

function BodyBlock({ body }: { body: string | null }) {
  const { t } = useI18n();
  if (!body) return <p className="text-gray-400 dark:text-gray-500 text-sm italic">{t('common.noBody')}</p>;
  let formatted = body;
  try { formatted = JSON.stringify(JSON.parse(body), null, 2); } catch { /* not JSON */ }
  return (
    <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap break-all">
      {formatted}
    </pre>
  );
}

function ResponseHeadersTable({ headers }: { headers: Record<string, string> }) {
  const { t } = useI18n();
  const entries = Object.entries(headers);
  if (entries.length === 0) return <p className="text-gray-400 dark:text-gray-500 text-sm italic">{t('common.noHeaders')}</p>;
  return (
    <div className="space-y-1">
      {entries.map(([key, val]) => (
        <div key={key} className="flex text-xs gap-2">
          <span className="text-blue-400 font-mono shrink-0">{key}:</span>
          <span className="text-gray-600 dark:text-gray-300 font-mono break-all">{val}</span>
        </div>
      ))}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Shared components ──
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <div className={`text-sm text-gray-900 dark:text-white mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function EditField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function MiniInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}
