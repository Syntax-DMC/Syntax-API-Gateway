import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import type { UseCaseTemplate, UseCaseContextParam, UseCaseCallDef, ApiDefinition, SapConnection, OrchestratorCallResult } from '../types';

const TABS = ['Overview', 'Context', 'API Calls', 'Test'] as const;
type Tab = typeof TABS[number];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/10 text-green-400',
  POST: 'bg-blue-500/10 text-blue-400',
  PUT: 'bg-yellow-500/10 text-yellow-400',
  PATCH: 'bg-orange-500/10 text-orange-400',
  DELETE: 'bg-red-500/10 text-red-400',
};

export default function UseCaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, activeTenantRole } = useAuth();
  const isAdmin = user?.isSuperadmin || activeTenantRole === 'admin';

  const { data: template, reload } = useApi<UseCaseTemplate>(id ? `/api/use-cases/${id}` : null);
  const { data: allDefs } = useApi<ApiDefinition[]>('/api/registry?active=true');
  const { data: connections } = useApi<SapConnection[]>('/api/connections');

  const [tab, setTab] = useState<Tab>('Overview');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Draft state for editing
  const [draftName, setDraftName] = useState('');
  const [draftSlug, setDraftSlug] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftMode, setDraftMode] = useState<'parallel' | 'sequential'>('parallel');
  const [draftTags, setDraftTags] = useState('');
  const [draftActive, setDraftActive] = useState(true);
  const [draftContext, setDraftContext] = useState<UseCaseContextParam[]>([]);
  const [draftCalls, setDraftCalls] = useState<UseCaseCallDef[]>([]);

  // Test state
  const [testConnId, setTestConnId] = useState('');
  const [testContext, setTestContext] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<OrchestratorCallResult[] | null>(null);
  const [testDuration, setTestDuration] = useState(0);
  const [executing, setExecuting] = useState(false);
  const [testError, setTestError] = useState('');

  // Slug picker
  const [showSlugPicker, setShowSlugPicker] = useState(false);
  const [slugSearch, setSlugSearch] = useState('');

  const defsMap = useMemo(() => {
    const m = new Map<string, ApiDefinition>();
    allDefs?.forEach((d) => m.set(d.slug, d));
    return m;
  }, [allDefs]);

  const filteredDefs = useMemo(() => {
    if (!allDefs) return [];
    const q = slugSearch.toLowerCase();
    return allDefs.filter(
      (d) => d.slug.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || d.method.toLowerCase().includes(q)
    );
  }, [allDefs, slugSearch]);

  function startEdit() {
    if (!template) return;
    setDraftName(template.name);
    setDraftSlug(template.slug);
    setDraftDescription(template.description || '');
    setDraftMode(template.mode);
    setDraftTags(template.tags.join(', '));
    setDraftActive(template.is_active);
    setDraftContext([...template.required_context.map((c) => ({ ...c }))]);
    setDraftCalls([...template.calls.map((c) => ({ ...c, param_mapping: { ...c.param_mapping } }))]);
    setEditing(true);
    setError('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await api(`/api/use-cases/${id}`, 'PATCH', {
        name: draftName,
        slug: draftSlug,
        description: draftDescription || null,
        mode: draftMode,
        tags: draftTags.split(',').map((t) => t.trim()).filter(Boolean),
        is_active: draftActive,
        required_context: draftContext,
        calls: draftCalls,
      });
      setEditing(false);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    try {
      await api(`/api/use-cases/${id}`, 'DELETE');
      navigate('/use-cases');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleTest() {
    if (!testConnId) return;
    setExecuting(true);
    setTestError('');
    setTestResults(null);
    try {
      const result = await api<{ results: OrchestratorCallResult[]; totalDurationMs: number }>(
        `/api/use-cases/${id}/test`,
        'POST',
        { connectionId: testConnId, context: testContext }
      );
      setTestResults(result.results);
      setTestDuration(result.totalDurationMs);
    } catch (err) {
      setTestError((err as Error).message);
    } finally {
      setExecuting(false);
    }
  }

  // ── Context param helpers ──────────────────────────────

  function addContextParam() {
    setDraftContext([...draftContext, { name: '', type: 'string', required: true }]);
  }

  function removeContextParam(idx: number) {
    setDraftContext(draftContext.filter((_, i) => i !== idx));
  }

  function updateContextParam(idx: number, field: keyof UseCaseContextParam, value: unknown) {
    const copy = [...draftContext];
    (copy[idx] as unknown as Record<string, unknown>)[field] = value;
    setDraftContext(copy);
  }

  // ── Call helpers ───────────────────────────────────────

  function addCall(def: ApiDefinition) {
    const paramMapping: Record<string, string> = {};
    // Auto-populate from query_params
    for (const p of def.query_params) {
      paramMapping[p.name] = p.context_var || `{{${p.name}}}`;
    }
    // Auto-populate path params
    const pathParams = def.path.match(/\{(\w+)\}/g);
    if (pathParams) {
      for (const pp of pathParams) {
        const name = pp.slice(1, -1);
        if (!paramMapping[name]) {
          paramMapping[name] = `{{${name}}}`;
        }
      }
    }
    setDraftCalls([...draftCalls, { slug: def.slug, param_mapping: paramMapping }]);
    setShowSlugPicker(false);
    setSlugSearch('');
  }

  function removeCall(idx: number) {
    setDraftCalls(draftCalls.filter((_, i) => i !== idx));
  }

  function moveCall(idx: number, dir: -1 | 1) {
    const copy = [...draftCalls];
    const target = idx + dir;
    if (target < 0 || target >= copy.length) return;
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setDraftCalls(copy);
  }

  function updateCallParam(callIdx: number, paramKey: string, value: string) {
    const copy = [...draftCalls];
    copy[callIdx] = { ...copy[callIdx], param_mapping: { ...copy[callIdx].param_mapping, [paramKey]: value } };
    setDraftCalls(copy);
  }

  function addCallParam(callIdx: number) {
    const key = prompt('Parameter name:');
    if (!key) return;
    updateCallParam(callIdx, key, `{{${key}}}`);
  }

  function removeCallParam(callIdx: number, paramKey: string) {
    const copy = [...draftCalls];
    const newMapping = { ...copy[callIdx].param_mapping };
    delete newMapping[paramKey];
    copy[callIdx] = { ...copy[callIdx], param_mapping: newMapping };
    setDraftCalls(copy);
  }

  if (!template) {
    return <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>;
  }

  const data = editing
    ? { name: draftName, slug: draftSlug, description: draftDescription, mode: draftMode, tags: draftTags.split(',').map((t) => t.trim()).filter(Boolean), is_active: draftActive, required_context: draftContext, calls: draftCalls }
    : template;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/use-cases')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{data.name}</h1>
          <span className={`px-2 py-0.5 text-xs rounded font-medium ${data.mode === 'parallel' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'}`}>
            {data.mode}
          </span>
          <span className={`px-2 py-0.5 text-xs rounded font-medium ${data.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
            {data.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button onClick={startEdit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Edit</button>
                <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg">Delete</button>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        {tab === 'Overview' && (
          <div className="space-y-4">
            {editing ? (
              <>
                <Field label="Name"><input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="input-field" /></Field>
                <Field label="Slug"><input value={draftSlug} onChange={(e) => setDraftSlug(e.target.value)} className="input-field font-mono text-sm" /></Field>
                <Field label="Description"><textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} rows={3} className="input-field" /></Field>
                <Field label="Mode">
                  <select value={draftMode} onChange={(e) => setDraftMode(e.target.value as 'parallel' | 'sequential')} className="input-field">
                    <option value="parallel">Parallel</option>
                    <option value="sequential">Sequential</option>
                  </select>
                </Field>
                <Field label="Tags (comma-separated)"><input value={draftTags} onChange={(e) => setDraftTags(e.target.value)} className="input-field" /></Field>
                <Field label="Active">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draftActive} onChange={(e) => setDraftActive(e.target.checked)} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Template is active</span>
                  </label>
                </Field>
              </>
            ) : (
              <>
                <InfoRow label="Slug" value={template.slug} mono />
                <InfoRow label="Description" value={template.description || '—'} />
                <InfoRow label="Mode" value={template.mode} />
                <InfoRow label="Tags" value={template.tags.length > 0 ? template.tags.join(', ') : '—'} />
                <InfoRow label="Context Params" value={String(template.required_context.length)} />
                <InfoRow label="API Calls" value={String(template.calls.length)} />
                <InfoRow label="Created" value={new Date(template.created_at).toLocaleString()} />
                <InfoRow label="Updated" value={new Date(template.updated_at).toLocaleString()} />
              </>
            )}
          </div>
        )}

        {tab === 'Context' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Context parameters are the values the agent must provide when executing this template (e.g. plant, workcenter).
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium">Example</th>
                  <th className="pb-2 font-medium">Required</th>
                  {editing && <th className="pb-2 font-medium w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {(editing ? draftContext : template.required_context).map((p, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2 pr-2">{editing ? <input value={p.name} onChange={(e) => updateContextParam(i, 'name', e.target.value)} className="input-field-sm" /> : <span className="font-mono">{p.name}</span>}</td>
                    <td className="py-2 pr-2">{editing ? (
                      <select value={p.type} onChange={(e) => updateContextParam(i, 'type', e.target.value)} className="input-field-sm">
                        <option value="string">string</option><option value="integer">integer</option><option value="number">number</option><option value="boolean">boolean</option>
                      </select>
                    ) : p.type}</td>
                    <td className="py-2 pr-2">{editing ? <input value={p.description || ''} onChange={(e) => updateContextParam(i, 'description', e.target.value)} className="input-field-sm" /> : (p.description || '—')}</td>
                    <td className="py-2 pr-2">{editing ? <input value={p.example || ''} onChange={(e) => updateContextParam(i, 'example', e.target.value)} className="input-field-sm" /> : (p.example || '—')}</td>
                    <td className="py-2 pr-2">{editing ? <input type="checkbox" checked={p.required} onChange={(e) => updateContextParam(i, 'required', e.target.checked)} /> : (p.required ? 'Yes' : 'No')}</td>
                    {editing && <td className="py-2"><button onClick={() => removeContextParam(i)} className="text-red-500 hover:text-red-700 text-xs">Remove</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {editing && (
              <button onClick={addContextParam} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg">
                + Add Parameter
              </button>
            )}
          </div>
        )}

        {tab === 'API Calls' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              API calls are executed when this template runs. Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{paramName}}'}</code> to reference context parameters.
            </p>

            {(editing ? draftCalls : template.calls).map((call, ci) => {
              const def = defsMap.get(call.slug);
              return (
                <div key={ci} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm font-mono">#{ci + 1}</span>
                      {def && <span className={`px-1.5 py-0.5 text-xs rounded font-mono font-bold ${METHOD_COLORS[def.method] || 'bg-gray-500/10 text-gray-400'}`}>{def.method}</span>}
                      <span className="font-mono text-sm text-gray-900 dark:text-white">{call.slug}</span>
                      {def && <span className="text-xs text-gray-400">{def.path}</span>}
                    </div>
                    {editing && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveCall(ci, -1)} disabled={ci === 0} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30">Up</button>
                        <button onClick={() => moveCall(ci, 1)} disabled={ci === draftCalls.length - 1} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30">Down</button>
                        <button onClick={() => removeCall(ci)} className="px-1.5 py-0.5 text-xs text-red-500 hover:text-red-700">Remove</button>
                      </div>
                    )}
                  </div>

                  {/* Param mapping */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Parameter Mapping</p>
                    {Object.entries(call.param_mapping).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-gray-600 dark:text-gray-300 w-32 shrink-0">{key}</span>
                        <span className="text-gray-400">=</span>
                        {editing ? (
                          <>
                            <input
                              value={value}
                              onChange={(e) => updateCallParam(ci, key, e.target.value)}
                              className="input-field-sm flex-1 font-mono"
                            />
                            <button onClick={() => removeCallParam(ci, key)} className="text-red-400 hover:text-red-600 text-xs">x</button>
                          </>
                        ) : (
                          <span className="font-mono text-blue-600 dark:text-blue-400">{value}</span>
                        )}
                      </div>
                    ))}
                    {editing && (
                      <button onClick={() => addCallParam(ci)} className="text-xs text-blue-500 hover:text-blue-700">+ Add param</button>
                    )}
                  </div>
                </div>
              );
            })}

            {editing && (
              <div className="relative">
                <button
                  onClick={() => setShowSlugPicker(!showSlugPicker)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
                >
                  + Add API Call
                </button>

                {showSlugPicker && (
                  <div className="absolute top-full left-0 mt-1 w-[600px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-20 max-h-80 overflow-auto">
                    <div className="p-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <input
                        autoFocus
                        type="text"
                        value={slugSearch}
                        onChange={(e) => setSlugSearch(e.target.value)}
                        placeholder="Search APIs..."
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                      />
                    </div>
                    {filteredDefs.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => addCall(d)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-sm border-b border-gray-100 dark:border-gray-700/50"
                      >
                        <span className={`px-1.5 py-0.5 text-xs rounded font-mono font-bold shrink-0 ${METHOD_COLORS[d.method] || ''}`}>{d.method}</span>
                        <span className="font-mono text-gray-900 dark:text-white truncate">{d.slug}</span>
                        <span className="text-gray-400 truncate">{d.name}</span>
                        <span className="text-gray-400 text-xs ml-auto shrink-0">{d.path}</span>
                      </button>
                    ))}
                    {filteredDefs.length === 0 && (
                      <p className="p-3 text-sm text-gray-400">No APIs found.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'Test' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Connection</label>
              <select
                value={testConnId}
                onChange={(e) => setTestConnId(e.target.value)}
                className="input-field max-w-md"
              >
                <option value="">Select connection...</option>
                {connections?.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Context Parameters</p>
              <div className="space-y-2 max-w-md">
                {template.required_context.map((p) => (
                  <div key={p.name}>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                      {p.name} {p.required && <span className="text-red-400">*</span>}
                      {p.description && <span className="ml-1">— {p.description}</span>}
                    </label>
                    <input
                      type="text"
                      value={testContext[p.name] || ''}
                      onChange={(e) => setTestContext({ ...testContext, [p.name]: e.target.value })}
                      placeholder={p.example || p.name}
                      className="input-field-sm w-full"
                    />
                  </div>
                ))}
                {template.required_context.length === 0 && (
                  <p className="text-sm text-gray-400">No context parameters defined.</p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleTest}
                disabled={executing || !testConnId}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {executing ? 'Executing...' : 'Execute'}
              </button>
            </div>

            {testError && <p className="text-red-500 text-sm">{testError}</p>}

            {testResults && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Completed in {testDuration}ms — {testResults.filter((r) => r.status === 'fulfilled').length}/{testResults.length} succeeded
                </p>
                {testResults.map((r, i) => (
                  <div key={i} className={`border rounded-lg p-3 ${r.status === 'fulfilled' ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${r.status === 'fulfilled' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                        {r.status === 'fulfilled' ? r.statusCode : 'ERROR'}
                      </span>
                      <span className="font-mono text-sm text-gray-900 dark:text-white">{r.slug}</span>
                      {r.durationMs !== undefined && <span className="text-xs text-gray-400">{r.durationMs}ms</span>}
                    </div>
                    {r.error && <p className="text-sm text-red-500">{r.error}</p>}
                    {r.responseBody != null && (
                      <details className="mt-1">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Response body</summary>
                        <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs overflow-auto max-h-48">
                          {JSON.stringify(r.responseBody, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper components ────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex">
      <span className="w-40 text-sm text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className={`text-sm text-gray-900 dark:text-white ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
