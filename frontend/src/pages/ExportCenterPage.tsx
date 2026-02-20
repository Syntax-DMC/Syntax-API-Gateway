import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import type {
  ConnectionExportMeta,
  ExportFormat,
  ExportScope,
  ExportPreviewResponse,
  ToolkitConfig,
} from '../types';

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'openapi3_json', label: 'OpenAPI 3.0 (JSON)' },
  { value: 'openapi3_yaml', label: 'OpenAPI 3.0 (YAML)' },
  { value: 'swagger2_json', label: 'Swagger 2.0 (JSON)' },
];

const SCOPE_OPTIONS: { value: ExportScope; label: string; desc: string }[] = [
  { value: 'all', label: 'All', desc: 'Query endpoint + API schemas' },
  { value: 'assigned', label: 'Assigned only', desc: 'API schemas only' },
];

type TabKey = 'spec' | 'toolkit' | 'usecase' | 'prompt';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'spec', label: 'OpenAPI Spec' },
  { key: 'toolkit', label: 'Toolkit Config' },
  { key: 'usecase', label: 'Use-Case Spec' },
  { key: 'prompt', label: 'Prompt Spec' },
];

export default function ExportCenterPage() {
  const { data: connections, loading } = useApi<ConnectionExportMeta[]>('/api/export');

  // Export modal state
  const [selectedConn, setSelectedConn] = useState<ConnectionExportMeta | null>(null);
  const [format, setFormat] = useState<ExportFormat>('openapi3_json');
  const [scope, setScope] = useState<ExportScope>('all');
  const [gatewayUrl, setGatewayUrl] = useState(window.location.origin);
  const [activeTab, setActiveTab] = useState<TabKey>('spec');

  // Preview
  const [specPreview, setSpecPreview] = useState<string | null>(null);
  const [specFilename, setSpecFilename] = useState('');
  const [toolkitConfig, setToolkitConfig] = useState<ToolkitConfig | null>(null);
  const [usecasePreview, setUsecasePreview] = useState<string | null>(null);
  const [usecaseFilename, setUsecaseFilename] = useState('');
  const [promptPreview, setPromptPreview] = useState<string | null>(null);
  const [promptFilename, setPromptFilename] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Fetch spec preview when params change
  useEffect(() => {
    if (!selectedConn || activeTab !== 'spec') return;

    let cancelled = false;
    setPreviewLoading(true);
    setError('');

    const params = new URLSearchParams({ format, scope, gatewayUrl });
    api<ExportPreviewResponse>(`/api/export/connections/${selectedConn.id}/preview?${params}`)
      .then((result) => {
        if (cancelled) return;
        setSpecPreview(result.content);
        setSpecFilename(result.filename);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedConn, format, scope, gatewayUrl, activeTab]);

  // Fetch toolkit config when tab switches
  useEffect(() => {
    if (!selectedConn || activeTab !== 'toolkit') return;

    let cancelled = false;
    setPreviewLoading(true);
    setError('');

    const params = new URLSearchParams({ gatewayUrl });
    api<ToolkitConfig>(`/api/export/connections/${selectedConn.id}/toolkit-config?${params}`)
      .then((result) => {
        if (cancelled) return;
        setToolkitConfig(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedConn, gatewayUrl, activeTab]);

  // Fetch use-case spec preview
  useEffect(() => {
    if (!selectedConn || activeTab !== 'usecase') return;

    let cancelled = false;
    setPreviewLoading(true);
    setError('');

    const params = new URLSearchParams({ gatewayUrl });
    api<ExportPreviewResponse>(`/api/export/connections/${selectedConn.id}/use-cases/preview?${params}`)
      .then((result) => {
        if (cancelled) return;
        setUsecasePreview(result.content);
        setUsecaseFilename(result.filename);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedConn, gatewayUrl, activeTab]);

  // Fetch prompt spec preview
  useEffect(() => {
    if (!selectedConn || activeTab !== 'prompt') return;

    let cancelled = false;
    setPreviewLoading(true);
    setError('');

    const params = new URLSearchParams({ gatewayUrl });
    api<ExportPreviewResponse>(`/api/export/connections/${selectedConn.id}/prompt-spec/preview?${params}`)
      .then((result) => {
        if (cancelled) return;
        setPromptPreview(result.content);
        setPromptFilename(result.filename);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedConn, gatewayUrl, activeTab]);

  function openExport(conn: ConnectionExportMeta) {
    setSelectedConn(conn);
    setFormat('openapi3_json');
    setScope('all');
    setActiveTab('spec');
    setSpecPreview(null);
    setToolkitConfig(null);
    setUsecasePreview(null);
    setPromptPreview(null);
    setError('');
    setCopied(false);
  }

  function closeExport() {
    setSelectedConn(null);
    setSpecPreview(null);
    setToolkitConfig(null);
    setUsecasePreview(null);
    setPromptPreview(null);
    setError('');
  }

  function getPreviewContent(): string {
    if (activeTab === 'toolkit' && toolkitConfig) return JSON.stringify(toolkitConfig, null, 2);
    if (activeTab === 'usecase' && usecasePreview) return usecasePreview;
    if (activeTab === 'prompt' && promptPreview) return promptPreview;
    return specPreview || '';
  }

  function getDownloadFilename(): string {
    if (activeTab === 'toolkit' && selectedConn) {
      const safe = selectedConn.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return `${safe}-toolkit-config.json`;
    }
    if (activeTab === 'usecase') return usecaseFilename;
    if (activeTab === 'prompt') return promptFilename;
    return specFilename;
  }

  function hasPreviewContent(): boolean {
    if (activeTab === 'spec') return !!specPreview;
    if (activeTab === 'toolkit') return !!toolkitConfig;
    if (activeTab === 'usecase') return !!usecasePreview;
    if (activeTab === 'prompt') return !!promptPreview;
    return false;
  }

  async function handleCopy() {
    const content = getPreviewContent();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy to clipboard failed');
    }
  }

  function handleDownload() {
    const content = getPreviewContent();
    const filename = getDownloadFilename();
    if (!content || !filename) return;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDirectDownload() {
    if (!selectedConn) return;
    if (activeTab === 'spec') {
      const params = new URLSearchParams({ format, scope, gatewayUrl });
      window.open(`/api/export/connections/${selectedConn.id}?${params}`, '_blank');
    } else if (activeTab === 'usecase') {
      const params = new URLSearchParams({ gatewayUrl });
      window.open(`/api/export/connections/${selectedConn.id}/use-cases?${params}`, '_blank');
    } else if (activeTab === 'prompt') {
      const params = new URLSearchParams({ gatewayUrl });
      window.open(`/api/export/connections/${selectedConn.id}/prompt-spec?${params}`, '_blank');
    }
  }

  function renderPreviewContent(): string {
    if (activeTab === 'spec' && specPreview) {
      try {
        if (format.endsWith('_json') || format === 'swagger2_json') {
          return JSON.stringify(JSON.parse(specPreview), null, 2);
        }
      } catch { /* fallthrough */ }
      return specPreview;
    }
    if (activeTab === 'toolkit' && toolkitConfig) return JSON.stringify(toolkitConfig, null, 2);
    if (activeTab === 'usecase' && usecasePreview) {
      try { return JSON.stringify(JSON.parse(usecasePreview), null, 2); } catch { return usecasePreview; }
    }
    if (activeTab === 'prompt' && promptPreview) return promptPreview;
    if (previewLoading) return '';
    return 'No preview available';
  }

  // Show format/scope controls only for the OpenAPI spec tab
  const showFormatControls = activeTab === 'spec';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Export Center</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Export OpenAPI specs, toolkit configurations, use-case specs, and prompt specifications for agent integration
        </p>
      </div>

      {/* Connections table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-3 text-gray-400 dark:text-gray-500 font-medium">Connection</th>
              <th className="text-left px-4 py-3 text-gray-400 dark:text-gray-500 font-medium">SAP Base URL</th>
              <th className="text-center px-4 py-3 text-gray-400 dark:text-gray-500 font-medium">Assigned APIs</th>
              <th className="text-center px-4 py-3 text-gray-400 dark:text-gray-500 font-medium">Status</th>
              <th className="text-right px-4 py-3 text-gray-400 dark:text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {connections && connections.length > 0 ? (
              connections.map((conn) => (
                <tr key={conn.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900 dark:text-white">{conn.name}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                    {conn.sap_base_url}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      conn.assigned_api_count > 0
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-gray-500/10 text-gray-400'
                    }`}>
                      {conn.assigned_api_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${
                      conn.is_active ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${conn.is_active ? 'bg-green-400' : 'bg-gray-400'}`} />
                      {conn.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openExport(conn)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                      Export
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                  No connections found. Create a connection first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Export Modal */}
      {selectedConn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Export – {selectedConn.name}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedConn.assigned_api_count} API{selectedConn.assigned_api_count !== 1 ? 's' : ''} assigned
                </p>
              </div>
              <button
                onClick={closeExport}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Controls row — shown only for spec tab */}
              {showFormatControls && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Format */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Format</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as ExportFormat)}
                      className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
                    >
                      {FORMAT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Scope */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Scope</label>
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value as ExportScope)}
                      className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
                    >
                      {SCOPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label} – {opt.desc}</option>
                      ))}
                    </select>
                  </div>

                  {/* Gateway URL */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Gateway URL</label>
                    <input
                      type="text"
                      value={gatewayUrl}
                      onChange={(e) => setGatewayUrl(e.target.value)}
                      placeholder="https://your-gateway.company.com"
                      className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Gateway URL for non-spec tabs */}
              {!showFormatControls && (
                <div className="max-w-md">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Gateway URL</label>
                  <input
                    type="text"
                    value={gatewayUrl}
                    onChange={(e) => setGatewayUrl(e.target.value)}
                    placeholder="https://your-gateway.company.com"
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
                  />
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setCopied(false); }}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === tab.key
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab description */}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {activeTab === 'spec' && 'OpenAPI specification for all registered APIs accessible through the gateway proxy.'}
                {activeTab === 'toolkit' && 'Toolkit configuration JSON for agent framework integration.'}
                {activeTab === 'usecase' && 'OpenAPI specification for use-case template endpoints (discovery + execution).'}
                {activeTab === 'prompt' && 'Markdown specification for AI agent system prompts — describes available use cases, parameters, and example requests.'}
              </p>

              {/* Error */}
              {error && (
                <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Preview */}
              <div className="relative">
                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-800/50 z-10 rounded-lg">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 overflow-auto max-h-[50vh] whitespace-pre-wrap">
                  {renderPreviewContent()}
                </pre>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
              <div className="text-xs text-gray-400">
                {getDownloadFilename() && <span>{getDownloadFilename()}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  disabled={previewLoading || !hasPreviewContent()}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                {(activeTab === 'spec' || activeTab === 'usecase' || activeTab === 'prompt') ? (
                  <button
                    onClick={handleDirectDownload}
                    disabled={previewLoading || !hasPreviewContent()}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Download
                  </button>
                ) : (
                  <button
                    onClick={handleDownload}
                    disabled={previewLoading || !hasPreviewContent()}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Download
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
