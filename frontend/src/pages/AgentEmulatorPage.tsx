import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import type { SapConnection, ApiDefinition, OrchestratorResult, OrchestratorCallResult } from '../types';

interface EmulatorPreset {
  name: string;
  plant: string;
  sfc: string;
  workcenter: string;
  resource: string;
}

const PRESETS_KEY = 'emulator-presets';

function loadPresets(): EmulatorPreset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
  } catch {
    return [];
  }
}

function savePresets(presets: EmulatorPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export default function AgentEmulatorPage() {
  const { t } = useI18n();
  const { data: connections } = useApi<SapConnection[]>('/api/connections');
  const { data: allDefs } = useApi<ApiDefinition[]>('/api/registry');

  // Connection
  const [connectionId, setConnectionId] = useState('');

  // Namespace fields
  const [plant, setPlant] = useState('');
  const [sfc, setSfc] = useState('');
  const [workcenter, setWorkcenter] = useState('');
  const [resource, setResource] = useState('');

  // Presets
  const [presets, setPresets] = useState<EmulatorPreset[]>(loadPresets);
  const [presetOpen, setPresetOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const presetRef = useRef<HTMLDivElement>(null);

  // Assigned APIs
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loadingApis, setLoadingApis] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());

  // Response state
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());

  // Load assigned APIs when connection changes
  useEffect(() => {
    if (!connectionId) {
      setAssignedIds(new Set());
      setSelectedSlugs(new Set());
      return;
    }
    setLoadingApis(true);
    api<{ apiDefinitionIds: string[] }>(`/api/connections/${connectionId}/assignments`)
      .then((data) => setAssignedIds(new Set(data.apiDefinitionIds)))
      .catch(() => setAssignedIds(new Set()))
      .finally(() => setLoadingApis(false));
  }, [connectionId]);

  // Filter definitions to assigned ones
  const assignedDefs = (allDefs || []).filter((d) => assignedIds.has(d.id) && d.is_active);

  // Close preset dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) {
        setPresetOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Toggle API selection
  function toggleSlug(slug: string) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  // Build context from namespace fields
  function buildContext(): Record<string, string> {
    const ctx: Record<string, string> = {};
    if (plant.trim()) ctx.plant = plant.trim();
    if (sfc.trim()) ctx.sfc = sfc.trim();
    if (workcenter.trim()) ctx.workcenter = workcenter.trim();
    if (resource.trim()) ctx.resource = resource.trim();
    return ctx;
  }

  // Save preset
  function handleSavePreset() {
    if (!presetName.trim()) return;
    const newPreset: EmulatorPreset = {
      name: presetName.trim(),
      plant,
      sfc,
      workcenter,
      resource,
    };
    const updated = [...presets.filter((p) => p.name !== newPreset.name), newPreset];
    setPresets(updated);
    savePresets(updated);
    setPresetName('');
    setSaveModalOpen(false);
  }

  // Load preset
  function handleLoadPreset(preset: EmulatorPreset) {
    setPlant(preset.plant);
    setSfc(preset.sfc);
    setWorkcenter(preset.workcenter);
    setResource(preset.resource);
    setPresetOpen(false);
  }

  // Delete preset
  function handleDeletePreset(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = presets.filter((p) => p.name !== name);
    setPresets(updated);
    savePresets(updated);
  }

  // Execute test
  const handleTest = useCallback(async () => {
    if (!connectionId || selectedSlugs.size === 0) return;
    setLoading(true);
    setError('');
    setResult(null);
    setExpandedSlugs(new Set());

    try {
      const res = await api<OrchestratorResult>('/api/emulator/execute', 'POST', {
        connectionId,
        slugs: Array.from(selectedSlugs),
        context: buildContext(),
      });
      setResult(res);
      // Auto-expand all results
      setExpandedSlugs(new Set(res.results.map((r) => r.slug)));
    } catch (err) {
      setError((err as Error).message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [connectionId, selectedSlugs, plant, sfc, workcenter, resource]);

  // Ctrl+Enter to test
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleTest();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleTest]);

  const canTest = connectionId && selectedSlugs.size > 0 && !loading;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('emulator.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('emulator.subtitle')}</p>
      </div>

      {/* Connection selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
          {t('emulator.connection')}
        </label>
        <select
          value={connectionId}
          onChange={(e) => {
            setConnectionId(e.target.value);
            setSelectedSlugs(new Set());
            setResult(null);
            setError('');
          }}
          className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2.5 text-sm"
        >
          <option value="">{t('emulator.selectConnection')}</option>
          {connections?.filter((c) => c.is_active).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.sap_base_url}
            </option>
          ))}
        </select>
      </div>

      {connectionId && (
        <>
          {/* Namespaces */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('emulator.namespaces')}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSaveModalOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 transition-colors"
                >
                  {t('emulator.savePreset')}
                </button>
                <div className="relative" ref={presetRef}>
                  <button
                    onClick={() => setPresetOpen(!presetOpen)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {t('emulator.loadPreset')}
                  </button>
                  {presetOpen && (
                    <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 overflow-hidden">
                      {presets.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                          {t('emulator.noPresets')}
                        </p>
                      ) : (
                        presets.map((p) => (
                          <div
                            key={p.name}
                            onClick={() => handleLoadPreset(p)}
                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm text-gray-700 dark:text-gray-200"
                          >
                            <span className="truncate">{p.name}</span>
                            <button
                              onClick={(e) => handleDeletePreset(p.name, e)}
                              className="text-gray-400 hover:text-red-400 transition-colors ml-2 shrink-0"
                            >
                              &times;
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <NamespaceField label={t('emulator.plant')} value={plant} onChange={setPlant} placeholder="e.g. 1000" />
              <NamespaceField label={t('emulator.sfc')} value={sfc} onChange={setSfc} placeholder="e.g. SFC-001" />
              <NamespaceField label={t('emulator.workcenter')} value={workcenter} onChange={setWorkcenter} placeholder="e.g. WC-01" />
              <NamespaceField label={t('emulator.resource')} value={resource} onChange={setResource} placeholder="e.g. RES-01" />
            </div>
          </div>

          {/* Data Selection */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {t('emulator.dataSelection')}
              </h2>
              {assignedDefs.length > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedSlugs(new Set(assignedDefs.map((d) => d.slug)))}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {t('emulator.selectAll')}
                  </button>
                  <button
                    onClick={() => setSelectedSlugs(new Set())}
                    className="text-xs text-gray-400 hover:text-gray-300"
                  >
                    {t('common.clear')}
                  </button>
                </div>
              )}
            </div>

            {loadingApis && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">{t('common.loading')}</p>
            )}

            {!loadingApis && assignedDefs.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-6">
                {t('emulator.noApisAssigned')}
              </p>
            )}

            {!loadingApis && assignedDefs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {assignedDefs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => toggleSlug(d.slug)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      selectedSlugs.has(d.slug)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MethodBadge method={d.method} />
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {d.name || d.slug}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{d.slug}</p>
                    {d.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {d.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Test button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={!canTest}
              className={`px-8 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                canTest
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              {loading ? <Spinner label={t('common.testing')} /> : t('emulator.test')}
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500">Ctrl+Enter</span>
            {selectedSlugs.size > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {t('emulator.selectedCount', { count: selectedSlugs.size })}
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Response */}
          {result && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Response header */}
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4">
                <h2 className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('common.response')}</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {result.totalDurationMs}ms {t('emulator.total')}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {result.results.length} API{result.results.length !== 1 ? 's' : ''}
                </span>
                {result.layers && result.layers.length > 1 && (
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">
                    {t('emulator.layers', { count: result.layers.length })}
                  </span>
                )}
              </div>

              {/* Per-slug results */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {result.results.map((r) => (
                  <ResultCard
                    key={r.slug}
                    result={r}
                    expanded={expandedSlugs.has(r.slug)}
                    onToggle={() =>
                      setExpandedSlugs((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.slug)) next.delete(r.slug);
                        else next.add(r.slug);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hint when nothing shown */}
          {!result && !error && !loading && (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">
              {t('emulator.hint')}
            </p>
          )}
        </>
      )}

      {/* No connection selected hint */}
      {!connectionId && (
        <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-12">
          {t('emulator.noConnection')}
        </p>
      )}

      {/* Save preset modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSaveModalOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl w-full max-w-sm p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('emulator.savePreset')}
            </h3>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={t('emulator.presetNamePlaceholder')}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePreset();
              }}
            />
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-4 space-y-1">
              {plant && <p>Plant: {plant}</p>}
              {sfc && <p>SFC: {sfc}</p>}
              {workcenter && <p>Workcenter: {workcenter}</p>}
              {resource && <p>Resource: {resource}</p>}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSaveModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helper components ─────────────────────────────────── */

function NamespaceField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-600"
      />
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-green-500/10 text-green-500',
    POST: 'bg-blue-500/10 text-blue-400',
    PUT: 'bg-yellow-500/10 text-yellow-500',
    PATCH: 'bg-orange-500/10 text-orange-400',
    DELETE: 'bg-red-500/10 text-red-400',
  };
  return (
    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${colors[method] || 'bg-gray-500/10 text-gray-400'}`}>
      {method}
    </span>
  );
}

function ResultCard({
  result,
  expanded,
  onToggle,
}: {
  result: OrchestratorCallResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ok = result.status === 'fulfilled';
  const statusColor = !ok
    ? 'text-red-400'
    : result.statusCode && result.statusCode < 300
      ? 'text-green-400'
      : result.statusCode && result.statusCode < 500
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <span className="text-gray-400 dark:text-gray-500 text-xs w-4">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="text-sm font-mono font-medium text-gray-800 dark:text-gray-100">{result.slug}</span>
        {ok && result.statusCode != null && (
          <span className={`text-sm font-mono ${statusColor}`}>{result.statusCode}</span>
        )}
        {!ok && <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400">error</span>}
        {result.durationMs != null && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{result.durationMs}ms</span>
        )}
        {result.responseSizeBytes != null && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatBytes(result.responseSizeBytes)}</span>
        )}
        {result.layer != null && result.layer > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
            L{result.layer}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-3">
          {/* Injected params */}
          {result.injectedParams && Object.keys(result.injectedParams).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.injectedParams).map(([key, val]) => (
                <span
                  key={key}
                  className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono"
                >
                  {key}={val}
                </span>
              ))}
            </div>
          )}

          {/* Error */}
          {result.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
              {result.error}
            </div>
          )}

          {/* Response body */}
          {result.responseBody != null && (
            <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre-wrap break-all">
              {typeof result.responseBody === 'string'
                ? result.responseBody
                : JSON.stringify(result.responseBody, null, 2)}
            </pre>
          )}

          {/* Response headers */}
          {result.responseHeaders && Object.keys(result.responseHeaders).length > 0 && (
            <details className="text-xs">
              <summary className="text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
                Headers ({Object.keys(result.responseHeaders).length})
              </summary>
              <div className="mt-2 space-y-0.5 pl-2">
                {Object.entries(result.responseHeaders).map(([key, val]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-blue-400 font-mono shrink-0">{key}:</span>
                    <span className="text-gray-500 dark:text-gray-400 font-mono break-all">{val}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner({ label }: { label?: string }) {
  return (
    <span className="flex items-center gap-2">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
