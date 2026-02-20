import { useState, useMemo, useRef, useEffect } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import type {
  SapConnection,
  ApiDefinition,
  OrchestratorApiCall,
  OrchestratorCallResult,
  OrchestratorResult,
  ExecutionPlan,
} from '../types';

interface CallEntry {
  id: number;
  slug: string;
  params: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  expanded: boolean;
}

let nextCallId = 1;

export default function OrchestrationPage() {
  const { data: connections } = useApi<SapConnection[]>('/api/connections');
  const { data: definitions } = useApi<ApiDefinition[]>('/api/registry?active=true');

  const [connectionId, setConnectionId] = useState('');
  const [mode, setMode] = useState<'parallel' | 'sequential'>('parallel');
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'builder' | 'results'>('builder');

  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');

  // Slug picker state
  const [showSlugPicker, setShowSlugPicker] = useState(false);
  const [slugSearch, setSlugSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowSlugPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredDefs = useMemo(() => {
    if (!definitions) return [];
    const q = slugSearch.toLowerCase();
    return definitions.filter(
      (d) =>
        d.slug.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.method.toLowerCase().includes(q)
    );
  }, [definitions, slugSearch]);

  const defsMap = useMemo(() => {
    const m = new Map<string, ApiDefinition>();
    definitions?.forEach((d) => m.set(d.slug, d));
    return m;
  }, [definitions]);

  function addCall(def: ApiDefinition) {
    const params: Record<string, string> = {};
    // Pre-populate param fields from definition
    if (def.query_params) {
      for (const qp of def.query_params) {
        params[qp.name] = qp.default || qp.example || '';
      }
    }
    // Also add path params
    const pathParams = def.path.match(/\{(\w+)\}/g);
    if (pathParams) {
      for (const pp of pathParams) {
        const name = pp.slice(1, -1);
        if (!(name in params)) params[name] = '';
      }
    }

    setCalls((prev) => [
      ...prev,
      { id: nextCallId++, slug: def.slug, params, headers: {}, body: '', expanded: true },
    ]);
    setShowSlugPicker(false);
    setSlugSearch('');
    setPlan(null);
  }

  function removeCall(id: number) {
    setCalls((prev) => prev.filter((c) => c.id !== id));
    setPlan(null);
  }

  function toggleExpand(id: number) {
    setCalls((prev) => prev.map((c) => (c.id === id ? { ...c, expanded: !c.expanded } : c)));
  }

  function updateParam(id: number, key: string, value: string) {
    setCalls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, params: { ...c.params, [key]: value } } : c))
    );
  }

  function updateBody(id: number, value: string) {
    setCalls((prev) => prev.map((c) => (c.id === id ? { ...c, body: value } : c)));
  }

  function buildCallsPayload(): OrchestratorApiCall[] {
    return calls.map((c) => {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(c.params)) {
        if (v.trim()) params[k] = v.trim();
      }
      return {
        slug: c.slug,
        params: Object.keys(params).length > 0 ? params : undefined,
        body: c.body.trim() || undefined,
      };
    });
  }

  async function handleValidate() {
    if (calls.length === 0) return;
    setValidating(true);
    setError('');
    setPlan(null);
    try {
      const p = await api<ExecutionPlan>('/api/orchestrator/validate', 'POST', {
        calls: buildCallsPayload(),
        mode,
      });
      setPlan(p);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setValidating(false);
    }
  }

  async function handleExecute() {
    if (calls.length === 0 || !connectionId) return;
    setExecuting(true);
    setError('');
    setResult(null);
    try {
      const r = await api<OrchestratorResult>('/api/orchestrator/execute', 'POST', {
        connectionId,
        calls: buildCallsPayload(),
        mode,
      });
      setResult(r);
      setActiveTab('results');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExecuting(false);
    }
  }

  const canExecute = connectionId && calls.length > 0 && !executing;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orchestration Workbench</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <TabButton active={activeTab === 'builder'} onClick={() => setActiveTab('builder')}>
          Builder
        </TabButton>
        <TabButton active={activeTab === 'results'} onClick={() => setActiveTab('results')}>
          Results {result ? `(${result.results.length})` : ''}
        </TabButton>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Builder Tab */}
      {activeTab === 'builder' && (
        <div className="space-y-4">
          {/* Controls row */}
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]"
            >
              <option value="">Select connection...</option>
              {connections?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              <button
                onClick={() => { setMode('parallel'); setPlan(null); }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'parallel'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Parallel
              </button>
              <button
                onClick={() => { setMode('sequential'); setPlan(null); }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'sequential'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Sequential
              </button>
            </div>

            <span className="text-xs text-gray-400 dark:text-gray-500">
              {mode === 'parallel'
                ? 'All calls execute simultaneously'
                : 'Calls execute in dependency order with field injection'}
            </span>
          </div>

          {/* Add call button + slug picker */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowSlugPicker(!showSlugPicker)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Add API Call
            </button>
            {showSlugPicker && (
              <div className="absolute z-20 mt-1 w-96 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl overflow-hidden">
                <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={slugSearch}
                    onChange={(e) => setSlugSearch(e.target.value)}
                    placeholder="Search APIs..."
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded px-3 py-1.5 text-sm placeholder-gray-400 dark:placeholder-gray-500"
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredDefs.length === 0 && (
                    <p className="px-3 py-4 text-sm text-gray-400 dark:text-gray-500 text-center italic">
                      No matching APIs
                    </p>
                  )}
                  {filteredDefs.map((def) => (
                    <button
                      key={def.id}
                      onClick={() => addCall(def)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                    >
                      <MethodBadge method={def.method} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-700 dark:text-gray-200 truncate">{def.slug}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{def.name} &mdash; {def.path}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Call cards */}
          {calls.length === 0 && (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">
              Add API calls to build your orchestration query.
            </p>
          )}

          <div className="space-y-3">
            {calls.map((call, idx) => {
              const def = defsMap.get(call.slug);
              const hasBody = def && ['POST', 'PUT', 'PATCH'].includes(def.method);
              return (
                <div
                  key={call.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/80">
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono w-6">#{idx + 1}</span>
                    {def && <MethodBadge method={def.method} />}
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 font-mono">{call.slug}</span>
                    {def && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{def.path}</span>
                    )}
                    {def?.depends_on && def.depends_on.length > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">
                        depends: {def.depends_on.map((d) => d.api_slug).join(', ')}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => toggleExpand(call.id)}
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
                      >
                        {call.expanded ? 'Collapse' : 'Expand'}
                      </button>
                      <button
                        onClick={() => removeCall(call.id)}
                        className="text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors text-lg leading-none"
                      >
                        &times;
                      </button>
                    </div>
                  </div>

                  {/* Expandable params/body */}
                  {call.expanded && (
                    <div className="px-4 py-3 space-y-3 border-t border-gray-200 dark:border-gray-700">
                      {Object.keys(call.params).length > 0 && (
                        <div className="space-y-2">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Parameters</span>
                          {Object.entries(call.params).map(([key, val]) => (
                            <div key={key} className="flex items-center gap-2">
                              <label className="text-xs font-mono text-gray-500 dark:text-gray-400 w-32 shrink-0 truncate" title={key}>
                                {key}
                              </label>
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => updateParam(call.id, key, e.target.value)}
                                className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded px-2 py-1 text-sm font-mono"
                                placeholder={def?.query_params?.find((p) => p.name === key)?.example || ''}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      {hasBody && (
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Body</span>
                          <textarea
                            value={call.body}
                            onChange={(e) => updateBody(call.id, e.target.value)}
                            placeholder='{ "json": "body" }'
                            rows={4}
                            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded px-3 py-2 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-600 resize-y"
                          />
                        </div>
                      )}
                      {Object.keys(call.params).length === 0 && !hasBody && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No parameters for this API</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action bar */}
          {calls.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleValidate}
                disabled={validating || calls.length === 0}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validating ? 'Validating...' : 'Validate'}
              </button>
              <button
                onClick={handleExecute}
                disabled={!canExecute}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  canExecute
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
              >
                {executing ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Executing...
                  </span>
                ) : (
                  'Execute'
                )}
              </button>
              {!connectionId && (
                <span className="text-xs text-yellow-400">Select a connection to execute</span>
              )}
            </div>
          )}

          {/* Plan panel */}
          {plan && <PlanPanel plan={plan} />}
        </div>
      )}

      {/* Results Tab */}
      {activeTab === 'results' && (
        <div className="space-y-4">
          {!result && (
            <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">
              No results yet. Build and execute a query first.
            </p>
          )}
          {result && <ResultsPanel result={result} />}
        </div>
      )}
    </div>
  );
}

/* -- Sub-components ---------------------------------------- */

function PlanPanel({ plan }: { plan: ExecutionPlan }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Execution Plan</span>
        <span className="text-xs px-2 py-0.5 rounded bg-blue-900/30 text-blue-400">{plan.mode}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {plan.resolvedSlugs.length} resolved, {plan.unresolvedSlugs.length} unresolved
        </span>
      </div>
      <div className="p-4 space-y-3">
        {/* Errors */}
        {plan.errors.length > 0 && (
          <div className="space-y-1">
            {plan.errors.map((err, i) => (
              <div key={i} className="text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">
                {err}
              </div>
            ))}
          </div>
        )}

        {/* Warnings */}
        {plan.warnings.length > 0 && (
          <div className="space-y-1">
            {plan.warnings.map((w, i) => (
              <div key={i} className="text-sm text-yellow-400 bg-yellow-900/20 rounded px-3 py-2">
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Unresolved */}
        {plan.unresolvedSlugs.length > 0 && (
          <div className="text-sm text-red-400">
            Unresolved: {plan.unresolvedSlugs.join(', ')}
          </div>
        )}

        {/* Layers */}
        <div className="flex flex-wrap gap-3 items-start">
          {plan.layers.map((layer) => (
            <div key={layer.layer} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 min-w-[120px]">
              <div className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">Layer {layer.layer}</div>
              <div className="space-y-1">
                {layer.slugs.map((slug) => (
                  <div key={slug} className="text-sm font-mono text-gray-700 dark:text-gray-200">{slug}</div>
                ))}
              </div>
            </div>
          ))}
          {plan.layers.length > 1 &&
            plan.layers.slice(0, -1).map((_, i) => (
              <div key={`arrow-${i}`} className="flex items-center self-center text-gray-400 dark:text-gray-500 text-lg">
                →
              </div>
            ))}
        </div>

        {/* Dependency edges */}
        {plan.dependencyEdges.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dependencies</div>
            <div className="space-y-1">
              {plan.dependencyEdges.map((edge, i) => (
                <div key={i} className="text-xs font-mono text-gray-500 dark:text-gray-400">
                  {edge.from} → {edge.to}
                  {edge.mappings.length > 0 && (
                    <span className="text-gray-400 dark:text-gray-500 ml-2">
                      ({edge.mappings.map((m) => `${m.source} → ${m.target}`).join(', ')})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultsPanel({ result }: { result: OrchestratorResult }) {
  const isSequential = result.mode === 'sequential';
  const grouped = useMemo(() => {
    if (!isSequential || !result.layers) return null;
    const map = new Map<number, OrchestratorCallResult[]>();
    for (const r of result.results) {
      const layer = r.layer ?? 0;
      if (!map.has(layer)) map.set(layer, []);
      map.get(layer)!.push(r);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [result, isSequential]);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
          Total: {result.totalDurationMs}ms
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-blue-900/30 text-blue-400">
          {result.mode}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {result.results.length} call{result.results.length !== 1 ? 's' : ''}
        </span>
        <span className="text-sm text-green-400">
          {result.results.filter((r) => r.status === 'fulfilled').length} succeeded
        </span>
        {result.results.some((r) => r.status === 'rejected') && (
          <span className="text-sm text-red-400">
            {result.results.filter((r) => r.status === 'rejected').length} failed
          </span>
        )}
      </div>

      {/* Results grouped by layer or flat */}
      {grouped
        ? grouped.map(([layerNum, items]) => (
            <div key={layerNum}>
              <div className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">
                Layer {layerNum}
              </div>
              <div className="space-y-2">
                {items.map((r, i) => (
                  <ResultCard key={`${layerNum}-${i}`} result={r} showInjected={isSequential} />
                ))}
              </div>
            </div>
          ))
        : <div className="space-y-2">
            {result.results.map((r, i) => (
              <ResultCard key={i} result={r} showInjected={false} />
            ))}
          </div>
      }
    </div>
  );
}

function ResultCard({ result, showInjected }: { result: OrchestratorCallResult; showInjected: boolean }) {
  const [bodyOpen, setBodyOpen] = useState(false);
  const [headersOpen, setHeadersOpen] = useState(false);

  const isFulfilled = result.status === 'fulfilled';

  let formattedBody = '';
  if (result.responseBody !== undefined && result.responseBody !== null) {
    try {
      formattedBody = typeof result.responseBody === 'string'
        ? result.responseBody
        : JSON.stringify(result.responseBody, null, 2);
    } catch {
      formattedBody = String(result.responseBody);
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <span className="text-sm font-mono font-medium text-gray-700 dark:text-gray-200">{result.slug}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded font-medium ${
            isFulfilled ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
          }`}
        >
          {result.status}
        </span>
        {result.statusCode && <StatusBadge code={result.statusCode} />}
        {result.durationMs !== undefined && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{result.durationMs}ms</span>
        )}
        {result.responseSizeBytes !== undefined && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatBytes(result.responseSizeBytes)}</span>
        )}
        {result.error && <span className="text-xs text-red-400 ml-auto">{result.error}</span>}
      </div>

      {/* Injected params indicator */}
      {showInjected && result.injectedParams && Object.keys(result.injectedParams).length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          <span className="text-xs text-purple-400">Injected:</span>
          {Object.entries(result.injectedParams).map(([key, val]) => (
            <span key={key} className="text-xs font-mono bg-purple-900/20 text-purple-300 rounded px-1.5 py-0.5">
              {key}={val.length > 30 ? val.slice(0, 30) + '...' : val}
            </span>
          ))}
        </div>
      )}

      {/* Collapsible sections */}
      {isFulfilled && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="flex">
            <button
              onClick={() => setBodyOpen(!bodyOpen)}
              className={`px-4 py-2 text-xs font-medium transition-colors ${
                bodyOpen ? 'text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Body {bodyOpen ? '▾' : '▸'}
            </button>
            <button
              onClick={() => setHeadersOpen(!headersOpen)}
              className={`px-4 py-2 text-xs font-medium transition-colors ${
                headersOpen ? 'text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Headers {headersOpen ? '▾' : '▸'}
            </button>
          </div>
          {bodyOpen && (
            <div className="px-4 pb-3">
              {formattedBody ? (
                <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                  {formattedBody}
                </pre>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">No body</p>
              )}
            </div>
          )}
          {headersOpen && result.responseHeaders && (
            <div className="px-4 pb-3 space-y-1">
              {Object.entries(result.responseHeaders).map(([key, val]) => (
                <div key={key} className="flex text-xs gap-2">
                  <span className="text-blue-400 font-mono shrink-0">{key}:</span>
                  <span className="text-gray-600 dark:text-gray-300 font-mono break-all">{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -- Shared helpers ---------------------------------------- */

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'text-green-400 bg-green-900/30',
    POST: 'text-blue-400 bg-blue-900/30',
    PUT: 'text-yellow-400 bg-yellow-900/30',
    PATCH: 'text-orange-400 bg-orange-900/30',
    DELETE: 'text-red-400 bg-red-900/30',
  };
  return (
    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${colors[method] || 'text-gray-400 bg-gray-900/30'}`}>
      {method}
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ code }: { code: number }) {
  const color = code < 300 ? 'bg-green-900/50 text-green-400' : code < 500 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-red-900/50 text-red-400';
  return <span className={`px-2 py-0.5 rounded text-xs font-mono ${color}`}>{code}</span>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
