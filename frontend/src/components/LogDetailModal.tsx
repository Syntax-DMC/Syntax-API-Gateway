import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { RequestLog } from '../types';

interface Props {
  logId: string;
  onClose: () => void;
}

export default function LogDetailModal({ logId, onClose }: Props) {
  const navigate = useNavigate();
  const [log, setLog] = useState<RequestLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    setError('');
    api<RequestLog>(`/api/logs/${logId}`)
      .then(setLog)
      .catch((err) => setError(err.message || 'Failed to load log'))
      .finally(() => setLoading(false));
  }, [logId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const toggle = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Request Detail</h2>
          <div className="flex items-center gap-3">
            {log && log.target === 'sap_dm' && (
              <button
                onClick={() => { onClose(); navigate(`/explorer?logId=${logId}`); }}
                className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Replay in Explorer
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors text-xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loading && <p className="text-gray-500 dark:text-gray-400 text-center py-8">Loading...</p>}
          {error && <p className="text-red-400 text-center py-8">{error}</p>}

          {log && (
            <>
              {/* Summary */}
              <Section title="Summary" collapsed={collapsed['summary']} onToggle={() => toggle('summary')}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Field label="Method" value={log.method} mono />
                  <Field label="Status" value={log.status_code != null ? String(log.status_code) : '—'} mono
                    color={log.status_code != null ? (log.status_code < 300 ? 'text-green-400' : log.status_code < 500 ? 'text-yellow-400' : 'text-red-400') : undefined} />
                  <Field label="Path" value={log.path} mono full />
                  <Field label="Target" value={log.target === 'sap_dm' ? 'SAP DM' : 'Agent'} />
                  <Field label="Duration" value={log.duration_ms != null ? `${log.duration_ms}ms` : '—'} />
                  <Field label="Request Size" value={log.request_body_size != null ? formatBytes(log.request_body_size) : '—'} />
                  <Field label="Response Size" value={log.response_body_size != null ? formatBytes(log.response_body_size) : '—'} />
                  <Field label="Time" value={new Date(log.created_at).toLocaleString()} />
                  {log.error_message && <Field label="Error" value={log.error_message} color="text-red-400" full />}
                </div>
              </Section>

              {/* Request Headers */}
              <Section title="Request Headers" collapsed={collapsed['reqHeaders']} onToggle={() => toggle('reqHeaders')}>
                {log.request_headers && Object.keys(log.request_headers).length > 0 ? (
                  <HeadersTable headers={log.request_headers} />
                ) : (
                  <Empty>No request headers captured</Empty>
                )}
              </Section>

              {/* Request Body */}
              <Section title="Request Body" collapsed={collapsed['reqBody']} onToggle={() => toggle('reqBody')}>
                <BodyBlock body={log.request_body} />
              </Section>

              {/* Response Headers */}
              <Section title="Response Headers" collapsed={collapsed['resHeaders']} onToggle={() => toggle('resHeaders')}>
                {log.response_headers && Object.keys(log.response_headers).length > 0 ? (
                  <HeadersTable headers={log.response_headers} />
                ) : (
                  <Empty>No response headers captured</Empty>
                )}
              </Section>

              {/* Response Body */}
              <Section title="Response Body" collapsed={collapsed['resBody']} onToggle={() => toggle('resBody')}>
                <BodyBlock body={log.response_body} />
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, collapsed, onToggle, children }: {
  title: string; collapsed?: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/70 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{title}</span>
        <span className="text-gray-400 dark:text-gray-500 text-xs">{collapsed ? '+' : '-'}</span>
      </button>
      {!collapsed && <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30">{children}</div>}
    </div>
  );
}

function Field({ label, value, mono, color, full }: {
  label: string; value: string; mono?: boolean; color?: string; full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <span className="text-gray-400 dark:text-gray-500 text-xs">{label}</span>
      <p className={`${mono ? 'font-mono' : ''} ${color || 'text-gray-700 dark:text-gray-200'} text-sm break-all`}>{value}</p>
    </div>
  );
}

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  return (
    <div className="space-y-1">
      {Object.entries(headers).map(([key, val]) => (
        <div key={key} className="flex text-xs gap-2">
          <span className="text-blue-400 font-mono shrink-0">{key}:</span>
          <span className="text-gray-600 dark:text-gray-300 font-mono break-all">{val}</span>
        </div>
      ))}
    </div>
  );
}

function BodyBlock({ body }: { body: string | null }) {
  if (!body) return <Empty>No body captured</Empty>;

  let formatted = body;
  try {
    const parsed = JSON.parse(body);
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    // not JSON, show as-is
  }

  return (
    <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 rounded p-3 overflow-x-auto max-h-80 whitespace-pre-wrap break-all">
      {formatted}
    </pre>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-400 dark:text-gray-500 text-sm italic">{children}</p>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
