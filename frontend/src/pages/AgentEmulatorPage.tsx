import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import type { SapConnection, ApiDefinition } from '../types';

type Mode = 'orchestrated' | 'direct';

interface EmulatorResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  sizeBytes: number;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export default function AgentEmulatorPage() {
  const { data: connections } = useApi<SapConnection[]>('/api/connections');
  const { data: allDefs } = useApi<ApiDefinition[]>('/api/registry');

  // Core state
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connectionId, setConnectionId] = useState('');
  const [mode, setMode] = useState<Mode>('orchestrated');

  // Assigned APIs for selected connection
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loadingApis, setLoadingApis] = useState(false);

  // Orchestrated mode state
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [contextRows, setContextRows] = useState<{ key: string; value: string }[]>([
    { key: '', value: '' },
  ]);

  // Direct mode state
  const [directMethod, setDirectMethod] = useState('GET');
  const [directPath, setDirectPath] = useState('');
  const [headerRows, setHeaderRows] = useState<{ key: string; value: string }[]>([]);
  const [directBody, setDirectBody] = useState('');

  // Response state
  const [result, setResult] = useState<EmulatorResponse | null>(null);
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'curl'>('body');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load assigned APIs when connection changes
  useEffect(() => {
    if (!connectionId) {
      setAssignedIds(new Set());
      return;
    }
    setLoadingApis(true);
    api<{ apiDefinitionIds: string[] }>(`/api/connections/${connectionId}/assignments`)
      .then((data) => setAssignedIds(new Set(data.apiDefinitionIds)))
      .catch(() => setAssignedIds(new Set()))
      .finally(() => setLoadingApis(false));
  }, [connectionId]);

  // Filter definitions to assigned ones
  const assignedDefs = (allDefs || []).filter((d) => assignedIds.has(d.id));

  // Toggle slug selection
  function toggleSlug(slug: string) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  // Context row helpers
  const addContextRow = () => setContextRows((r) => [...r, { key: '', value: '' }]);
  const removeContextRow = (i: number) => setContextRows((r) => r.filter((_, idx) => idx !== i));
  const updateContextRow = (i: number, field: 'key' | 'value', val: string) =>
    setContextRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  // Header row helpers
  const addHeaderRow = () => setHeaderRows((r) => [...r, { key: '', value: '' }]);
  const removeHeaderRow = (i: number) => setHeaderRows((r) => r.filter((_, idx) => idx !== i));
  const updateHeaderRow = (i: number, field: 'key' | 'value', val: string) =>
    setHeaderRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  // Build context object from rows
  function buildContext(): Record<string, string> {
    const ctx: Record<string, string> = {};
    contextRows.forEach((r) => {
      if (r.key.trim() && r.value.trim()) ctx[r.key.trim()] = r.value.trim();
    });
    return ctx;
  }

  // Build cURL command
  function buildCurl(): string {
    if (mode === 'orchestrated') {
      const body = JSON.stringify({ slugs: Array.from(selectedSlugs), context: buildContext() });
      return `curl -X POST ${window.location.origin}/gw/query \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${apiKey}" \\\n  -d '${body}'`;
    } else {
      const cleanPath = directPath.startsWith('/') ? directPath : `/${directPath}`;
      const hdrs = headerRows
        .filter((h) => h.key.trim() && h.value.trim())
        .map((h) => `  -H "${h.key.trim()}: ${h.value.trim()}"`)
        .join(' \\\n');
      const keyHeader = `  -H "x-api-key: ${apiKey}"`;
      const allHeaders = [keyHeader, hdrs].filter(Boolean).join(' \\\n');
      const bodyPart =
        directBody.trim() && ['POST', 'PUT', 'PATCH'].includes(directMethod)
          ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${directBody.trim()}'`
          : '';
      return `curl -X ${directMethod} ${window.location.origin}/gw/dm${cleanPath} \\\n${allHeaders}${bodyPart}`;
    }
  }

  // Send request
  const handleSend = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError('');
    setResult(null);

    const startTime = Date.now();

    try {
      let res: Response;

      if (mode === 'orchestrated') {
        if (selectedSlugs.size === 0) {
          setError('Select at least one API slug');
          setLoading(false);
          return;
        }
        res = await fetch('/gw/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            slugs: Array.from(selectedSlugs),
            context: buildContext(),
          }),
        });
      } else {
        if (!directPath) {
          setError('Enter a path');
          setLoading(false);
          return;
        }
        const cleanPath = directPath.startsWith('/') ? directPath : `/${directPath}`;
        const headers: Record<string, string> = { 'x-api-key': apiKey };
        headerRows.forEach((h) => {
          if (h.key.trim() && h.value.trim()) headers[h.key.trim()] = h.value.trim();
        });
        if (directBody.trim() && ['POST', 'PUT', 'PATCH'].includes(directMethod)) {
          headers['Content-Type'] = 'application/json';
        }

        res = await fetch(`/gw/dm${cleanPath}`, {
          method: directMethod,
          headers,
          body:
            directBody.trim() && ['POST', 'PUT', 'PATCH'].includes(directMethod)
              ? directBody.trim()
              : undefined,
        });
      }

      const durationMs = Date.now() - startTime;
      const bodyText = await res.text();
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      setResult({
        status: res.status,
        headers: resHeaders,
        body: bodyText,
        durationMs,
        sizeBytes: new TextEncoder().encode(bodyText).length,
      });
      setResponseTab('body');
    } catch (err) {
      setError((err as Error).message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [apiKey, mode, selectedSlugs, contextRows, directMethod, directPath, headerRows, directBody]);

  // Ctrl+Enter to send
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSend]);

  const canSend = apiKey && (mode === 'orchestrated' ? selectedSlugs.size > 0 : !!directPath) && !loading;

  // Collect unique required params from selected APIs
  const requiredParams = new Set<string>();
  assignedDefs
    .filter((d) => selectedSlugs.has(d.slug))
    .forEach((d) => {
      d.query_params?.forEach((p) => {
        if (p.required) requiredParams.add(p.name);
      });
    });

  return (
    <div className="flex gap-4 h-[calc(100vh-5rem)]">
      {/* Sidebar — Assigned APIs */}
      {connectionId && mode === 'orchestrated' && (
        <div className="w-72 shrink-0 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Assigned APIs ({assignedDefs.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingApis && (
              <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-4 text-center">Loading...</p>
            )}
            {!loadingApis && assignedDefs.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-4 text-center italic">
                No APIs assigned to this connection
              </p>
            )}
            {assignedDefs.map((d) => (
              <label
                key={d.id}
                className={`flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  selectedSlugs.has(d.slug)
                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 border border-transparent'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedSlugs.has(d.slug)}
                  onChange={() => toggleSlug(d.slug)}
                  className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <MethodBadge method={d.method} />
                    <span className="text-xs font-mono text-gray-700 dark:text-gray-200 truncate">
                      {d.slug}
                    </span>
                  </div>
                  {d.name && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {d.name}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {/* Quick select/deselect all */}
          {assignedDefs.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 flex gap-2">
              <button
                onClick={() => setSelectedSlugs(new Set(assignedDefs.map((d) => d.slug)))}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedSlugs(new Set())}
                className="text-xs text-gray-400 hover:text-gray-300"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agent Emulator</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Test gateway endpoints as an AI agent would. Requests go through the real gateway proxy.
        </p>

        {/* API Key + Connection */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sdmg_..."
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-500 pr-16"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Connection (for API list)
            </label>
            <select
              value={connectionId}
              onChange={(e) => {
                setConnectionId(e.target.value);
                setSelectedSlugs(new Set());
              }}
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Optional...</option>
              {connections?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setMode('orchestrated')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'orchestrated'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Orchestrated Query
          </button>
          <button
            onClick={() => setMode('direct')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'direct'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Direct SAP Call
          </button>
        </div>

        {/* Orchestrated mode */}
        {mode === 'orchestrated' && (
          <div className="space-y-4">
            {/* Selected slugs summary */}
            {selectedSlugs.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedSlugs).map((slug) => (
                  <span
                    key={slug}
                    className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-mono px-2 py-0.5 rounded"
                  >
                    {slug}
                    <button
                      onClick={() => toggleSlug(slug)}
                      className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            {!connectionId && (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                Select a connection above to browse assigned APIs, or type slugs manually below.
              </p>
            )}

            {/* Manual slug input (always available) */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Add slug manually
              </label>
              <input
                type="text"
                placeholder="Type slug and press Enter..."
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      setSelectedSlugs((prev) => new Set(prev).add(val));
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
            </div>

            {/* Context params */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Context Parameters
                {requiredParams.size > 0 && (
                  <span className="ml-2 font-normal text-gray-400 dark:text-gray-500">
                    Required: {Array.from(requiredParams).join(', ')}
                  </span>
                )}
              </label>
              <div className="space-y-2">
                {contextRows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => updateContextRow(i, 'key', e.target.value)}
                      placeholder="key (e.g. plant)"
                      className="flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded px-2 py-1.5 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-600"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateContextRow(i, 'value', e.target.value)}
                      placeholder="value"
                      className="flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded px-2 py-1.5 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-600"
                    />
                    <button
                      onClick={() => removeContextRow(i)}
                      className="text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors text-lg leading-none px-1"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <button
                  onClick={addContextRow}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  + Add parameter
                </button>
              </div>
            </div>

            {/* Send */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                  canSend
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
              >
                {loading ? <Spinner /> : 'Send POST /gw/query'}
              </button>
              <span className="text-xs text-gray-400 dark:text-gray-500">Ctrl+Enter</span>
            </div>
          </div>
        )}

        {/* Direct SAP mode */}
        {mode === 'direct' && (
          <div className="space-y-4">
            {/* Method + Path */}
            <div className="flex gap-2">
              <select
                value={directMethod}
                onChange={(e) => setDirectMethod(e.target.value)}
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm font-mono w-28"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 font-mono">
                  /gw/dm
                </span>
                <input
                  type="text"
                  value={directPath}
                  onChange={(e) => setDirectPath(e.target.value)}
                  placeholder="/sap/dme/workorder/v1/orders?plant=1000"
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg pl-16 pr-3 py-2 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
            </div>

            {/* Headers */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  Headers {headerRows.length > 0 ? `(${headerRows.length})` : ''}
                </span>
              </div>
              <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30 space-y-2">
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                  x-api-key is added automatically from the API Key field above.
                </p>
                {headerRows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => updateHeaderRow(i, 'key', e.target.value)}
                      placeholder="Header name"
                      className="flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded px-2 py-1.5 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-600"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateHeaderRow(i, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded px-2 py-1.5 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-600"
                    />
                    <button
                      onClick={() => removeHeaderRow(i)}
                      className="text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors text-lg leading-none px-1"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <button
                  onClick={addHeaderRow}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  + Add header
                </button>
              </div>
            </div>

            {/* Body */}
            {['POST', 'PUT', 'PATCH'].includes(directMethod) && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Body</span>
                </div>
                <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30">
                  <textarea
                    value={directBody}
                    onChange={(e) => setDirectBody(e.target.value)}
                    placeholder='{ "json": "body" }'
                    rows={6}
                    className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-600 resize-y"
                  />
                </div>
              </div>
            )}

            {/* Send */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                  canSend
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
              >
                {loading ? <Spinner /> : `Send ${directMethod} /gw/dm/...`}
              </button>
              <span className="text-xs text-gray-400 dark:text-gray-500">Ctrl+Enter</span>
            </div>
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
              <span className="text-sm text-gray-500 dark:text-gray-400">Response</span>
              <StatusBadge code={result.status} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{result.durationMs}ms</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{formatBytes(result.sizeBytes)}</span>
            </div>

            <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70">
              <TabButton active={responseTab === 'body'} onClick={() => setResponseTab('body')}>
                Body
              </TabButton>
              <TabButton
                active={responseTab === 'headers'}
                onClick={() => setResponseTab('headers')}
              >
                Headers ({Object.keys(result.headers).length})
              </TabButton>
              <TabButton active={responseTab === 'curl'} onClick={() => setResponseTab('curl')}>
                cURL
              </TabButton>
            </div>

            <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30">
              {responseTab === 'body' && <BodyBlock body={result.body} />}
              {responseTab === 'headers' && <HeadersTable headers={result.headers} />}
              {responseTab === 'curl' && <CurlBlock curl={buildCurl()} />}
            </div>
          </div>
        )}

        {/* Hint */}
        {!result && !error && !loading && (
          <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">
            Paste an API key, select slugs or enter a path, and hit Send (or Ctrl+Enter).
          </p>
        )}
      </div>
    </div>
  );
}

/* -- Helper components ---------------------------------------- */

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'text-green-400',
    POST: 'text-blue-400',
    PUT: 'text-yellow-400',
    PATCH: 'text-orange-400',
    DELETE: 'text-red-400',
  };
  return (
    <span className={`text-[10px] font-mono font-bold shrink-0 w-9 ${colors[method] || 'text-gray-400'}`}>
      {method}
    </span>
  );
}

function Spinner() {
  return (
    <span className="flex items-center gap-2">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      Sending
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'text-blue-400 border-b-2 border-blue-400'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ code }: { code: number }) {
  const color =
    code < 300
      ? 'bg-green-900/50 text-green-400'
      : code < 500
        ? 'bg-yellow-900/50 text-yellow-400'
        : 'bg-red-900/50 text-red-400';
  return <span className={`px-2 py-0.5 rounded text-sm font-mono ${color}`}>{code}</span>;
}

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0)
    return <p className="text-gray-400 dark:text-gray-500 text-sm italic">No headers</p>;
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

function BodyBlock({ body }: { body: string | null }) {
  if (!body) return <p className="text-gray-400 dark:text-gray-500 text-sm italic">No body</p>;
  let formatted = body;
  try {
    formatted = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    // not JSON
  }
  return (
    <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 rounded p-3 overflow-x-auto max-h-96 whitespace-pre-wrap break-all">
      {formatted}
    </pre>
  );
}

function CurlBlock({ curl }: { curl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => {
          navigator.clipboard.writeText(curl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
        {curl}
      </pre>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
