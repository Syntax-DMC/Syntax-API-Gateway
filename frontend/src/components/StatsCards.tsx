import type { LogStats } from '../types';

interface Props {
  stats: LogStats | null;
  connectionCount: number;
}

export default function StatsCards({ stats, connectionCount }: Props) {
  const total = stats?.totalRequests ?? 0;
  const ok = stats?.byStatus['2xx'] ?? 0;
  const successRate = total > 0 ? ((ok / total) * 100).toFixed(1) : '—';
  const avgMs = stats
    ? Math.round(
        ((stats.avgDurationMs.agent || 0) + (stats.avgDurationMs.sap_dm || 0)) /
          (stats.avgDurationMs.agent && stats.avgDurationMs.sap_dm ? 2 : 1) || 0
      )
    : 0;

  const cards = [
    { label: 'Requests (24h)', value: total.toLocaleString(), color: 'blue' },
    { label: 'Success Rate', value: successRate === '—' ? '—' : `${successRate}%`, color: 'green' },
    { label: 'Avg Latency', value: total > 0 ? `${avgMs}ms` : '—', color: 'yellow' },
    { label: 'Connections', value: connectionCount, color: 'purple' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    purple: 'bg-purple-500/10 text-purple-400',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">{c.label}</p>
          <p className={`text-2xl font-bold mt-1 ${colorMap[c.color]?.split(' ')[1] || 'text-gray-900 dark:text-white'}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
