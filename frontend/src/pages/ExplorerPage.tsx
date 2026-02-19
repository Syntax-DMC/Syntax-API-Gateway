import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import type { SapConnection, RequestLog, ExplorerResult, CatalogItem, DiscoveredPath } from '../types';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export default function ExplorerPage() {
  const { data: connections } = useApi<SapConnection[]>('/api/connections');
  const { data: catalog, reload: reloadCatalog } = useApi<CatalogItem[]>('/api/catalog');
  const { data: discovered } = useApi<DiscoveredPath[]>('/api/catalog/discovered');
  const [searchParams, setSearchParams] = useSearchParams();

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [savedOpen, setSavedOpen] = useState(true);
  const [discoveredOpen, setDiscoveredOpen] = useState(true);
  const [saveTitle, setSaveTitle] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Request state
  const [connectionId, setConnectionId] = useState('');
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('');
  const [headerRows, setHeaderRows] = useState<{ key: string; value: string }[]>([]);
  const [body, setBody] = useState('');
  const [requestTab, setRequestTab] = useState<'headers' | 'body'>('headers');

  // Response state
  const [result, setResult] = useState<ExplorerResult | null>(null);
  const [responseTab, setResponseTab] = useState<'body' | 'headers'>('body');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Replay from log
  const replayLogId = searchParams.get('logId');
  useEffect(() => {
    if (!replayLogId) return;
    api<RequestLog>(`/api/logs/${replayLogId}`)
      .then((log) => {
        if (log.sap_connection_id) setConnectionId(log.sap_connection_id);
        setMethod(log.method);
        setPath(log.path.replace(/^\/gw\/dm/, ''));
        if (log.request_headers) {
          setHeaderRows(
            Object.entries(log.request_headers)
              .filter(([k]) => !['authorization', 'x-api-key', 'host'].includes(k.toLowerCase()))
              .map(([key, value]) => ({ key, value }))
          );
        }
        if (log.request_body) setBody(log.request_body);
        setSearchParams({}, { replace: true });
      })
      .catch(() => {});
  }, [replayLogId, setSearchParams]);

  // Load catalog item into form
  const loadCatalogItem = (item: CatalogItem) => {
    if (item.sap_connection_id) setConnectionId(item.sap_connection_id);
    setMethod(item.method);
    setPath(item.path);
    if (item.headers) {
      setHeaderRows(Object.entries(item.headers).map(([key, value]) => ({ key, value })));
    } else {
      setHeaderRows([]);
    }
    setBody(item.body || '');
    setResult(null);
    setError('');
  };

  // Load discovered path into form
  const loadDiscovered = (d: DiscoveredPath) => {
    setMethod(d.method);
    setPath(d.path.replace(/^\/gw\/dm/, ''));
    setResult(null);
    setError('');
  };

  // Save current request to catalog
  const handleSave = async () => {
    if (!saveTitle.trim() || !method || !path) return;
    setSaveError('');
    const headers: Record<string, string> = {};
    headerRows.forEach((h) => {
      if (h.key.trim() && h.value.trim()) headers[h.key.trim()] = h.value.trim();
    });
    try {
      await api('/api/catalog', 'POST', {
        title: saveTitle.trim(),
        method,
        path,
        sap_connection_id: connectionId || undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: body.trim() || undefined,
      });
      setSaveTitle('');
      setShowSaveForm(false);
      reloadCatalog();
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  // Delete catalog item
  const handleDeleteCatalog = async (id: string) => {
    try {
      await api(`/api/catalog/${id}`, 'DELETE');
      reloadCatalog();
    } catch {
      // ignore
    }
  };

  // Send request
  const handleSend = useCallback(async () => {
    if (!connectionId || !path) return;
    setLoading(true);
    setError('');
    setResult(null);

    const headers: Record<string, string> = {};
    headerRows.forEach((h) => {
      if (h.key.trim() && h.value.trim()) headers[h.key.trim()] = h.value.trim();
    });

    try {
      const res = await api<ExplorerResult>('/api/explorer/execute', 'POST', {
        connectionId,
        method,
        path,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: body.trim() || undefined,
      });
      setResult(res);
      setResponseTab('body');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [connectionId, method, path, headerRows, body]);

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

  // Header row helpers
  const addHeaderRow = () => setHeaderRows((r) => [...r, { key: '', value: '' }]);
  const removeHeaderRow = (i: number) => setHeaderRows((r) => r.filter((_, idx) => idx !== i));
  const updateHeaderRow = (i: number, field: 'key' | 'value', val: string) =>
    setHeaderRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  const canSend = connectionId && path && !loading;

  return (
    <div className="flex gap-4 h-[calc(100vh-5rem)]">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-72 shrink-0 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">API Catalog</span>
            <button onClick={() => setSidebarOpen(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs">
              Hide
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Saved section */}
            <div>
              <button
                onClick={() => setSavedOpen(!savedOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100/80 dark:bg-gray-800/80"
              >
                <span>Saved ({catalog?.length || 0})</span>
                <span>{savedOpen ? '-' : '+'}</span>
              </button>
              {savedOpen && (
                <div className="py-1">
                  {(!catalog || catalog.length === 0) && (
                    <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">No saved requests</p>
                  )}
                  {catalog?.map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer"
                      onClick={() => loadCatalogItem(item)}
                    >
                      <MethodBadge method={item.method} />
                      <span className="text-xs text-gray-600 dark:text-gray-300 truncate flex-1" title={`${item.path}\n${item.title}`}>
                        {item.title}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCatalog(item.id); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-red-400 text-xs transition-opacity"
                        title="Delete"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Discovered section */}
            <div>
              <button
                onClick={() => setDiscoveredOpen(!discoveredOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100/80 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700"
              >
                <span>Discovered ({discovered?.length || 0})</span>
                <span>{discoveredOpen ? '-' : '+'}</span>
              </button>
              {discoveredOpen && (
                <div className="py-1">
                  {(!discovered || discovered.length === 0) && (
                    <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">No API calls recorded yet</p>
                  )}
                  {discovered?.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer"
                      onClick={() => loadDiscovered(d)}
                    >
                      <MethodBadge method={d.method} />
                      <span className="text-xs text-gray-600 dark:text-gray-300 truncate flex-1 font-mono" title={d.path}>
                        {d.path.replace(/^\/gw\/dm/, '')}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{d.count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Save form */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-2">
            {showSaveForm ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="Request title..."
                  className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded px-2 py-1.5 text-xs placeholder-gray-400 dark:placeholder-gray-500"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveForm(false); }}
                />
                {saveError && <p className="text-red-400 text-[10px]">{saveError}</p>}
                <div className="flex gap-1">
                  <button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 rounded transition-colors">
                    Save
                  </button>
                  <button onClick={() => { setShowSaveForm(false); setSaveError(''); }} className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs py-1 rounded transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveForm(true)}
                disabled={!path}
                className={`w-full text-xs py-1.5 rounded transition-colors ${
                  path ? 'text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700' : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                + Save current request
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1"
              title="Show catalog"
            >
              Catalog
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">API Explorer</h1>
        </div>

        {/* Request bar */}
        <div className="flex gap-2">
          <select
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="">Connection...</option>
            {connections?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm font-mono w-28"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/sap/dme/workorder/v1/orders?plant=..."
            className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-500"
          />

          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              canSend
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Sending
              </span>
            ) : (
              'Send'
            )}
          </button>
        </div>

        {/* Request tabs */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <TabButton active={requestTab === 'headers'} onClick={() => setRequestTab('headers')}>
              Headers{headerRows.length > 0 ? ` (${headerRows.length})` : ''}
            </TabButton>
            <TabButton active={requestTab === 'body'} onClick={() => setRequestTab('body')}>
              Body
            </TabButton>
          </div>

          <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30">
            {requestTab === 'headers' && (
              <div className="space-y-2">
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
                <button onClick={addHeaderRow} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                  + Add header
                </button>
                {headerRows.length === 0 && (
                  <p className="text-gray-400 dark:text-gray-500 text-sm italic">
                    Authorization header is added automatically via SAP OAuth2.
                  </p>
                )}
              </div>
            )}

            {requestTab === 'body' && (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{ "json": "body" }'
                rows={8}
                className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-2 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-600 resize-y"
              />
            )}
          </div>
        </div>

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
              <StatusBadge code={result.statusCode} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{result.durationMs}ms</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{formatBytes(result.responseSizeBytes)}</span>
              {result.errorMessage && (
                <span className="text-sm text-red-400 ml-auto">{result.errorMessage}</span>
              )}
            </div>

            <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70">
              <TabButton active={responseTab === 'body'} onClick={() => setResponseTab('body')}>
                Body
              </TabButton>
              <TabButton active={responseTab === 'headers'} onClick={() => setResponseTab('headers')}>
                Headers ({Object.keys(result.responseHeaders).length})
              </TabButton>
            </div>

            <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30">
              {responseTab === 'body' && <BodyBlock body={result.responseBody} />}
              {responseTab === 'headers' && <HeadersTable headers={result.responseHeaders} />}
            </div>
          </div>
        )}

        {/* Hint */}
        {!result && !error && !loading && (
          <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">
            Select a connection, enter a path, and hit Send (or Ctrl+Enter) to test an API call.
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
  return <span className={`px-2 py-0.5 rounded text-sm font-mono ${color}`}>{code}</span>;
}

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return <p className="text-gray-400 dark:text-gray-500 text-sm italic">No headers</p>;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
