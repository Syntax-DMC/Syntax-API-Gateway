import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import LogDetailModal from '../components/LogDetailModal';
import type { LogListResponse, SapConnection } from '../types';

export default function LogsPage() {
  const { data: connections } = useApi<SapConnection[]>('/api/connections');
  const [target, setTarget] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [logs, setLogs] = useState<LogListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '50');
  if (target) params.set('target', target);
  if (connectionId) params.set('connectionId', connectionId);
  if (status) params.set('status', status);
  const queryStr = params.toString();

  async function loadLogs() {
    setLoading(true);
    try {
      const result = await api<LogListResponse>(`/api/logs?${queryStr}`);
      setLogs(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLogs(); }, [queryStr]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(loadLogs, 10_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, queryStr]);

  function resetFilters() {
    setTarget('');
    setConnectionId('');
    setStatus('');
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Request Logs</h1>
        <button
          onClick={() => setAutoRefresh(p => !p)}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            autoRefresh
              ? 'border-green-500/30 bg-green-500/10 text-green-400'
              : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-400 animate-pulse' : 'bg-gray-400 dark:bg-gray-600'}`} />
          Auto-refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={target} onChange={v => { setTarget(v); setPage(1); }} options={[
          { value: '', label: 'All targets' },
          { value: 'sap_dm', label: 'SAP DM' },
          { value: 'agent', label: 'Agent' },
        ]} />

        <select
          value={connectionId}
          onChange={e => { setConnectionId(e.target.value); setPage(1); }}
          className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All connections</option>
          {connections?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <Select value={status} onChange={v => { setStatus(v); setPage(1); }} options={[
          { value: '', label: 'All status' },
          { value: '2xx', label: '2xx Success' },
          { value: '4xx', label: '4xx Client Error' },
          { value: '5xx', label: '5xx Server Error' },
        ]} />

        {(target || connectionId || status) && (
          <button onClick={resetFilters} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
            Clear filters
          </button>
        )}

        {loading && <span className="text-xs text-gray-400 dark:text-gray-500">Loading...</span>}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Target</th>
                <th className="px-5 py-3 font-medium">Method</th>
                <th className="px-5 py-3 font-medium">Path</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {!logs?.data.length && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">No logs found</td></tr>
              )}
              {logs?.data.map(log => (
                <tr key={log.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setSelectedLogId(log.id)}>
                  <td className="px-5 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      log.target === 'agent' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {log.target === 'sap_dm' ? 'SAP DM' : 'Agent'}
                    </span>
                  </td>
                  <td className="px-5 py-2 font-mono text-gray-600 dark:text-gray-300">{log.method}</td>
                  <td className="px-5 py-2 font-mono text-gray-600 dark:text-gray-300 truncate max-w-[250px]" title={log.path}>{log.path}</td>
                  <td className="px-5 py-2">
                    <StatusBadge code={log.status_code} />
                  </td>
                  <td className="px-5 py-2 text-gray-500 dark:text-gray-400">{log.duration_ms != null ? `${log.duration_ms}ms` : '—'}</td>
                  <td className="px-5 py-2 text-gray-400 dark:text-gray-500 text-xs">
                    {log.response_body_size != null ? formatBytes(log.response_body_size) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {logs && logs.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-400 dark:text-gray-500">
              {logs.total.toLocaleString()} total &middot; Page {logs.page} of {logs.pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(logs.pages, p + 1))}
                disabled={page >= logs.pages}
                className="px-3 py-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLogId && (
        <LogDetailModal logId={selectedLogId} onClose={() => setSelectedLogId(null)} />
      )}
    </div>
  );
}

function StatusBadge({ code }: { code: number | null }) {
  if (code == null) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  const color = code < 300 ? 'text-green-400 bg-green-500/10' : code < 500 ? 'text-yellow-400 bg-yellow-500/10' : 'text-red-400 bg-red-500/10';
  return <span className={`font-mono text-xs px-2 py-0.5 rounded-full ${color}`}>{code}</span>;
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
