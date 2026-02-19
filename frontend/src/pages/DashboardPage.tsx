import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import StatsCards from '../components/StatsCards';
import LogDetailModal from '../components/LogDetailModal';
import type { LogStats, SapConnection, RequestLog, LogListResponse } from '../types';

export default function DashboardPage() {
  const POLL_INTERVAL = 15000; // 3 endpoints × 4/min = 12 req/min (well under 30/min rate limit)
  const { data: stats, reload: reloadStats } = useApi<LogStats>('/api/logs/stats?period=24h', [], POLL_INTERVAL);
  const { data: connections } = useApi<SapConnection[]>('/api/connections', [], POLL_INTERVAL);
  const { data: recentLogs, reload: reloadLogs } = useApi<LogListResponse>('/api/logs?limit=10', [], POLL_INTERVAL);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAll = async () => {
    if (!confirm('Alle Request-Logs unwiderruflich löschen?')) return;
    setDeleting(true);
    try {
      await api('/api/logs', 'DELETE');
      reloadLogs();
      reloadStats();
    } catch (err) {
      alert('Fehler beim Löschen: ' + (err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>

      <StatsCards stats={stats} connectionCount={connections?.length ?? 0} />

      {/* Target breakdown */}
      {stats && stats.totalRequests > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">By Target</h3>
            <div className="space-y-2">
              <Bar label="SAP DM" value={stats.byTarget.sap_dm} total={stats.totalRequests} color="bg-blue-500" />
              <Bar label="Agent" value={stats.byTarget.agent} total={stats.totalRequests} color="bg-purple-500" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">By Status</h3>
            <div className="space-y-2">
              <Bar label="2xx" value={stats.byStatus['2xx']} total={stats.totalRequests} color="bg-green-500" />
              <Bar label="4xx" value={stats.byStatus['4xx']} total={stats.totalRequests} color="bg-yellow-500" />
              <Bar label="5xx" value={stats.byStatus['5xx']} total={stats.totalRequests} color="bg-red-500" />
            </div>
          </div>
        </div>
      )}

      {/* Top paths */}
      {stats && stats.topPaths.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Top Paths (24h)</h3>
          <div className="space-y-1">
            {stats.topPaths.map(p => (
              <div key={p.path} className="flex items-center justify-between text-sm">
                <code className="text-gray-600 dark:text-gray-300 truncate mr-4">{p.path}</code>
                <span className="text-gray-400 dark:text-gray-500 shrink-0">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent requests */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Recent Requests</h3>
          {recentLogs && recentLogs.data.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={deleting}
              className="text-xs px-3 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Löschen...' : 'Alle löschen'}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-2 font-medium">Time</th>
                <th className="px-5 py-2 font-medium">Target</th>
                <th className="px-5 py-2 font-medium">Method</th>
                <th className="px-5 py-2 font-medium">Path</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs?.data.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">No requests yet</td></tr>
              )}
              {recentLogs?.data.map(log => (
                <tr key={log.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setSelectedLogId(log.id)}>
                  <td className="px-5 py-2 text-gray-500 dark:text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</td>
                  <td className="px-5 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${log.target === 'agent' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {log.target === 'sap_dm' ? 'SAP DM' : 'Agent'}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-gray-600 dark:text-gray-300 font-mono">{log.method}</td>
                  <td className="px-5 py-2 text-gray-600 dark:text-gray-300 font-mono truncate max-w-[200px]">{log.path}</td>
                  <td className="px-5 py-2"><StatusBadge code={log.status_code} /></td>
                  <td className="px-5 py-2 text-gray-500 dark:text-gray-400">{log.duration_ms != null ? `${log.duration_ms}ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Connection status */}
      {connections && connections.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Connection Status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {connections.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg px-4 py-3">
                <div className={`w-2.5 h-2.5 rounded-full ${c.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white truncate">{c.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{c.sap_base_url}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedLogId && (
        <LogDetailModal logId={selectedLogId} onClose={() => setSelectedLogId(null)} />
      )}
    </div>
  );
}

function StatusBadge({ code }: { code: number | null }) {
  if (code == null) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  const color = code < 300 ? 'text-green-400' : code < 500 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`font-mono ${color}`}>{code}</span>;
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 dark:text-gray-400 w-10">{label}</span>
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500 w-10 text-right">{value}</span>
    </div>
  );
}
