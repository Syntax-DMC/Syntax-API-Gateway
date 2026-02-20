import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import type { SapConnection, ApiDefinition, ParamDefinition } from '../types';

/* ────────────────────────────────────────────────────────── */
/*  Types                                                    */
/* ────────────────────────────────────────────────────────── */

interface FormData {
  name: string;
  sapBaseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  agentApiUrl: string;
  agentApiKey: string;
}

const emptyForm: FormData = {
  name: '', sapBaseUrl: '', tokenUrl: '', clientId: '',
  clientSecret: '', agentApiUrl: '', agentApiKey: '',
};

type WizardStep = 1 | 2 | 3 | 4 | 5;
type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

interface StepTestState {
  status: TestStatus;
  message: string;
  detail?: string;
}

interface ExtractedParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  example?: string;
  usedBy: string[];
}

const STEPS: { num: WizardStep; label: string }[] = [
  { num: 1, label: 'Connection' },
  { num: 2, label: 'API Key' },
  { num: 3, label: 'APIs' },
  { num: 4, label: 'Parameters' },
  { num: 5, label: 'Output' },
];

/* ────────────────────────────────────────────────────────── */
/*  Helper: extract unique params from selected APIs         */
/* ────────────────────────────────────────────────────────── */

function extractUniqueParams(selectedIds: Set<string>, allApis: ApiDefinition[]): ExtractedParam[] {
  const paramMap = new Map<string, ExtractedParam>();

  for (const a of allApis) {
    if (!selectedIds.has(a.id)) continue;
    for (const p of a.query_params) {
      const existing = paramMap.get(p.name);
      if (existing) {
        existing.usedBy.push(a.slug);
        if (!existing.description && p.description) existing.description = p.description;
        if (!existing.example && p.example) existing.example = p.example;
        if (p.required) existing.required = true;
      } else {
        paramMap.set(p.name, {
          name: p.name,
          type: p.type || 'string',
          required: p.required,
          description: p.description,
          example: p.example,
          usedBy: [a.slug],
        });
      }
    }
  }

  return Array.from(paramMap.values()).sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/* ────────────────────────────────────────────────────────── */
/*  Helper: generate Tools JSON (client-side)                */
/* ────────────────────────────────────────────────────────── */

function generateToolsJson(
  connectionName: string,
  gatewayUrl: string,
  selectedApis: ApiDefinition[],
  paramDefaults: Record<string, string>
): object {
  const safeName = connectionName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  return {
    toolkit: {
      name: `sap_dm_gw_${safeName}`,
      description: `SAP DM Gateway — ${selectedApis.map(a => a.name).join(', ')}`,
      headers: { 'X-API-Key': '<YOUR_GATEWAY_KEY>' },
      base_url: gatewayUrl,
    },
    apis: selectedApis.map(a => ({
      slug: a.slug,
      name: a.name,
      description: a.description || '',
      method: a.method,
      path: a.path,
      parameters: a.query_params.map((p: ParamDefinition) => ({
        name: p.name,
        type: p.type || 'string',
        required: p.required,
        description: p.description || '',
        default: paramDefaults[p.name] || p.default || p.example || '',
      })),
    })),
  };
}

/* ────────────────────────────────────────────────────────── */
/*  Helper: generate Prompt Spec markdown (client-side)      */
/* ────────────────────────────────────────────────────────── */

function generatePromptSpec(
  connectionName: string,
  gatewayUrl: string,
  selectedApis: ApiDefinition[],
  paramDefaults: Record<string, string>
): string {
  const lines: string[] = [];
  lines.push(`# SAP DM Gateway — ${connectionName}`);
  lines.push('');
  lines.push(`Base URL: ${gatewayUrl}`);
  lines.push('');
  lines.push('## Authentication');
  lines.push('All requests require an `x-api-key` header with your gateway API key.');
  lines.push('');
  lines.push(`## Available APIs (${selectedApis.length})`);
  lines.push('');

  for (const a of selectedApis) {
    lines.push(`### ${a.slug}`);
    lines.push(`**${a.name}** — ${a.method} ${a.path}`);
    if (a.description) lines.push(a.description);
    lines.push('');

    if (a.query_params.length > 0) {
      lines.push('Parameters:');
      for (const p of a.query_params) {
        const req = p.required ? 'required' : 'optional';
        const def = paramDefaults[p.name] || p.example || p.default;
        const defStr = def ? `, default: "${def}"` : '';
        lines.push(`  - \`${p.name}\` (${p.type || 'string'}, ${req}): ${p.description || '—'}${defStr}`);
      }
      lines.push('');
    }

    lines.push('Example:');
    lines.push('```json');
    const exParams: Record<string, string> = {};
    for (const p of a.query_params) {
      exParams[p.name] = paramDefaults[p.name] || p.example || p.default || `<${p.name}>`;
    }
    lines.push(JSON.stringify({ calls: [{ slug: a.slug, params: exParams }], mode: 'parallel' }, null, 2));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/* ────────────────────────────────────────────────────────── */
/*  Page Component                                           */
/* ────────────────────────────────────────────────────────── */

export default function ConnectionsPage() {
  const { data: connections, reload } = useApi<SapConnection[]>('/api/connections');

  // ── Edit modal state ──
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormData>(emptyForm);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ── Wizard state ──
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardForm, setWizardForm] = useState<FormData>(emptyForm);
  const [wizardError, setWizardError] = useState('');
  const [wizardSaving, setWizardSaving] = useState(false);
  const [stepTests, setStepTests] = useState<Record<number, StepTestState>>({});
  const [showAgentConfig, setShowAgentConfig] = useState(false);

  // Step 1 result
  const [createdConnectionId, setCreatedConnectionId] = useState<string | null>(null);

  // Step 2: Token
  const [tokenLabel, setTokenLabel] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Step 3: API selection
  const [availableApis, setAvailableApis] = useState<ApiDefinition[]>([]);
  const [apisLoading, setApisLoading] = useState(false);
  const [selectedApiIds, setSelectedApiIds] = useState<Set<string>>(new Set());
  const [apiSearch, setApiSearch] = useState('');

  // Step 4: Parameter defaults
  const [paramDefaults, setParamDefaults] = useState<Record<string, string>>({});

  // Step 5: Output
  const [gatewayUrl, setGatewayUrl] = useState(window.location.origin);
  const [outputTab, setOutputTab] = useState<'json' | 'prompt'>('json');
  const [outputCopied, setOutputCopied] = useState(false);

  // Inline test
  const [testResult, setTestResult] = useState<Record<string, string | null>>({});

  // ── Load APIs when entering step 3 ──
  useEffect(() => {
    if (showWizard && wizardStep === 3 && availableApis.length === 0 && !apisLoading) {
      setApisLoading(true);
      api<ApiDefinition[]>('/api/registry?active=true')
        .then(setAvailableApis)
        .catch(() => {})
        .finally(() => setApisLoading(false));
    }
  }, [showWizard, wizardStep, availableApis.length, apisLoading]);

  // ── Edit modal ─────────────────────────────────────────

  function openEdit(conn: SapConnection) {
    setEditForm({
      name: conn.name,
      sapBaseUrl: conn.sap_base_url,
      tokenUrl: conn.token_url,
      clientId: conn.client_id,
      clientSecret: '',
      agentApiUrl: conn.agent_api_url || '',
      agentApiKey: '',
    });
    setEditId(conn.id);
    setShowEdit(true);
    setEditError('');
  }

  async function handleEditSubmit() {
    setEditSaving(true);
    setEditError('');
    try {
      const body: Record<string, string | undefined> = { ...editForm };
      if (!body.clientSecret) delete body.clientSecret;
      if (!body.agentApiKey) delete body.agentApiKey;
      if (!body.agentApiUrl) { delete body.agentApiUrl; delete body.agentApiKey; }
      await api(`/api/connections/${editId}`, 'PATCH', body);
      setShowEdit(false);
      reload();
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setEditSaving(false);
    }
  }

  const editSet = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm(f => ({ ...f, [field]: e.target.value }));

  // ── Wizard ─────────────────────────────────────────────

  function openWizard() {
    setWizardForm(emptyForm);
    setWizardStep(1);
    setStepTests({});
    setWizardError('');
    setShowWizard(true);
    setShowAgentConfig(false);
    setCreatedConnectionId(null);
    setCreatedToken(null);
    setTokenLabel('');
    setTokenCopied(false);
    setAvailableApis([]);
    setSelectedApiIds(new Set());
    setApiSearch('');
    setParamDefaults({});
    setOutputTab('json');
    setOutputCopied(false);
  }

  function closeWizard() {
    if (createdConnectionId && wizardStep < 5) {
      if (!confirm('The connection was already created. Close the wizard anyway?')) return;
    }
    setShowWizard(false);
    if (createdConnectionId) reload();
  }

  const wizSet = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setWizardForm(f => ({ ...f, [field]: e.target.value }));
    setStepTests(prev => { const c = { ...prev }; delete c[1]; return c; });
  };

  // Step 1: Test URL + OAuth + create connection
  async function handleStep1() {
    const f = wizardForm;
    if (!f.name.trim() || !f.sapBaseUrl.trim() || !f.tokenUrl.trim() || !f.clientId.trim() || !f.clientSecret.trim()) {
      setStepTests(p => ({ ...p, 1: { status: 'error', message: 'All fields are required' } }));
      return;
    }
    setStepTests(p => ({ ...p, 1: { status: 'testing', message: 'Testing URL reachability...' } }));

    try {
      // Test URL
      const urlRes = await api<{ status: string; message?: string }>('/api/connections/test-url', 'POST', { url: f.sapBaseUrl });
      if (urlRes.status !== 'ok') {
        setStepTests(p => ({ ...p, 1: { status: 'error', message: urlRes.message || 'URL not reachable' } }));
        return;
      }

      setStepTests(p => ({ ...p, 1: { status: 'testing', message: 'Testing OAuth2 credentials...' } }));

      // Test OAuth
      const oauthRes = await api<{ status: string; expiresIn?: number; message?: string }>(
        '/api/connections/test-oauth', 'POST',
        { token_url: f.tokenUrl, client_id: f.clientId, client_secret: f.clientSecret }
      );
      if (oauthRes.status !== 'ok') {
        setStepTests(p => ({ ...p, 1: { status: 'error', message: oauthRes.message || 'OAuth2 failed' } }));
        return;
      }

      setStepTests(p => ({ ...p, 1: { status: 'testing', message: 'Creating connection...' } }));

      // Create connection
      const body: Record<string, string | undefined> = {
        name: f.name, sapBaseUrl: f.sapBaseUrl, tokenUrl: f.tokenUrl,
        clientId: f.clientId, clientSecret: f.clientSecret,
      };
      if (f.agentApiUrl) {
        body.agentApiUrl = f.agentApiUrl;
        if (f.agentApiKey) body.agentApiKey = f.agentApiKey;
      }

      const conn = await api<SapConnection>('/api/connections', 'POST', body);
      setCreatedConnectionId(conn.id);
      setTokenLabel(`${f.name} Key`);
      setStepTests(p => ({ ...p, 1: { status: 'ok', message: 'Connection created', detail: `Token expires in ${oauthRes.expiresIn}s` } }));
      setWizardStep(2);
    } catch (err) {
      setStepTests(p => ({ ...p, 1: { status: 'error', message: (err as Error).message } }));
    }
  }

  // Step 2: Generate token
  async function handleGenerateToken() {
    if (!createdConnectionId) return;
    setWizardSaving(true);
    setWizardError('');
    try {
      const res = await api<{ token: string }>('/api/tokens', 'POST', {
        sapConnectionId: createdConnectionId,
        label: tokenLabel || `${wizardForm.name} Key`,
      });
      setCreatedToken(res.token);
    } catch (err) {
      setWizardError((err as Error).message);
    } finally {
      setWizardSaving(false);
    }
  }

  async function copyToken() {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  }

  // Step 3: Toggle API selection
  function toggleApi(id: string) {
    setSelectedApiIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllApis() {
    const filtered = filteredApis();
    const allSelected = filtered.every(a => selectedApiIds.has(a.id));
    if (allSelected) {
      setSelectedApiIds(prev => {
        const next = new Set(prev);
        filtered.forEach(a => next.delete(a.id));
        return next;
      });
    } else {
      setSelectedApiIds(prev => {
        const next = new Set(prev);
        filtered.forEach(a => next.add(a.id));
        return next;
      });
    }
  }

  function filteredApis(): ApiDefinition[] {
    if (!apiSearch.trim()) return availableApis;
    const q = apiSearch.toLowerCase();
    return availableApis.filter(a =>
      a.slug.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.path.toLowerCase().includes(q)
    );
  }

  async function handleStep3Advance() {
    if (selectedApiIds.size === 0 || !createdConnectionId) return;
    setWizardSaving(true);
    setWizardError('');
    try {
      await api(`/api/connections/${createdConnectionId}/assign-apis`, 'POST', {
        apiDefinitionIds: Array.from(selectedApiIds),
      });
      // Pre-fill parameter defaults from examples
      const params = extractUniqueParams(selectedApiIds, availableApis);
      const defaults: Record<string, string> = {};
      for (const p of params) {
        if (p.example) defaults[p.name] = p.example;
      }
      setParamDefaults(defaults);
      setWizardStep(4);
    } catch (err) {
      setWizardError((err as Error).message);
    } finally {
      setWizardSaving(false);
    }
  }

  // Step 5: Output helpers
  function getSelectedApiObjects(): ApiDefinition[] {
    return availableApis.filter(a => selectedApiIds.has(a.id));
  }

  function getOutputContent(): string {
    const apis = getSelectedApiObjects();
    if (outputTab === 'json') {
      return JSON.stringify(generateToolsJson(wizardForm.name, gatewayUrl, apis, paramDefaults), null, 2);
    }
    return generatePromptSpec(wizardForm.name, gatewayUrl, apis, paramDefaults);
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(getOutputContent());
      setOutputCopied(true);
      setTimeout(() => setOutputCopied(false), 2000);
    } catch {
      setWizardError('Copy failed');
    }
  }

  function downloadOutput() {
    const content = getOutputContent();
    const ext = outputTab === 'json' ? 'json' : 'md';
    const safe = wizardForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = outputTab === 'json' ? `${safe}-tools.${ext}` : `${safe}-prompt.${ext}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Table actions ──────────────────────────────────────

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? All associated tokens and logs will be permanently deleted.`)) return;
    try {
      await api(`/api/connections/${id}`, 'DELETE');
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleTest(id: string) {
    setTestResult(prev => ({ ...prev, [id]: 'testing...' }));
    try {
      await api(`/api/connections/${id}/test`, 'POST');
      setTestResult(prev => ({ ...prev, [id]: 'ok' }));
    } catch (err) {
      setTestResult(prev => ({ ...prev, [id]: (err as Error).message }));
    }
  }

  // ── Shared render helpers ──────────────────────────────

  const METHOD_COLORS: Record<string, string> = {
    GET: 'bg-green-500/15 text-green-400',
    POST: 'bg-blue-500/15 text-blue-400',
    PUT: 'bg-yellow-500/15 text-yellow-400',
    PATCH: 'bg-orange-500/15 text-orange-400',
    DELETE: 'bg-red-500/15 text-red-400',
  };

  function StepIndicator() {
    return (
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((step, i) => {
          const isActive = wizardStep === step.num;
          const isCompleted = wizardStep > step.num;
          return (
            <div key={step.num} className="flex items-center flex-1">
              <div className="flex items-center gap-1.5 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  isActive ? 'bg-blue-600 text-white' :
                  isCompleted ? 'bg-green-500 text-white' :
                  'bg-gray-200 dark:bg-gray-700 text-gray-400'
                }`}>
                  {isCompleted ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : step.num}
                </div>
                <span className={`text-xs font-medium truncate ${
                  isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                }`}>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-4 h-0.5 mx-0.5 shrink-0 ${isCompleted ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function TestBadge({ state }: { state?: StepTestState }) {
    if (!state) return null;
    const { status, message, detail } = state;
    const styles = {
      testing: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
      ok: 'bg-green-500/10 border-green-500/20 text-green-400',
      error: 'bg-red-500/10 border-red-500/20 text-red-400',
      idle: '',
    };
    if (status === 'idle') return null;
    return (
      <div className={`flex items-center gap-2 mt-3 px-3 py-2 border rounded-lg ${styles[status]}`}>
        {status === 'testing' && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />}
        {status === 'ok' && <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
        {status === 'error' && <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
        <span className="text-sm">{message}</span>
        {detail && <span className="text-xs opacity-70 ml-auto">{detail}</span>}
      </div>
    );
  }

  // ── Extracted params for step 4 ──
  const extractedParams = wizardStep >= 4 ? extractUniqueParams(selectedApiIds, availableApis) : [];

  const isWideStep = wizardStep >= 3;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SAP Connections</h1>
        <button onClick={openWizard} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          New Connection
        </button>
      </div>

      {/* ── Wizard Modal ─────────────────────────────── */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-h-[90vh] overflow-y-auto p-6 transition-all ${isWideStep ? 'max-w-3xl' : 'max-w-lg'}`}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">New Connection</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Guided setup — connection, token, API selection, and agent output</p>

            <StepIndicator />

            {/* ── Step 1: SAP Connection ── */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <Field label="Connection Name" value={wizardForm.name} onChange={wizSet('name')} placeholder="My SAP DM Production" />
                <Field label="SAP Base URL" value={wizardForm.sapBaseUrl} onChange={wizSet('sapBaseUrl')} placeholder="https://api.eu20.dmc.cloud.sap" />
                <Field label="Token URL" value={wizardForm.tokenUrl} onChange={wizSet('tokenUrl')} placeholder="https://...authentication.../oauth/token" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Client ID" value={wizardForm.clientId} onChange={wizSet('clientId')} />
                  <Field label="Client Secret" value={wizardForm.clientSecret} onChange={wizSet('clientSecret')} type="password" />
                </div>

                {/* Agent config disclosure */}
                <button
                  onClick={() => setShowAgentConfig(!showAgentConfig)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className={`w-3 h-3 transition-transform ${showAgentConfig ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Agent Configuration (optional)
                </button>
                {showAgentConfig && (
                  <div className="space-y-3 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                    <Field label="Agent API URL" value={wizardForm.agentApiUrl} onChange={wizSet('agentApiUrl')} placeholder="https://studio-api.ai.syntax-rnd.com" />
                    <Field label="Agent API Key" value={wizardForm.agentApiKey} onChange={wizSet('agentApiKey')} type="password" />
                  </div>
                )}

                <TestBadge state={stepTests[1]} />
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={closeWizard} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
                  <button
                    onClick={handleStep1}
                    disabled={stepTests[1]?.status === 'testing'}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {stepTests[1]?.status === 'testing' ? 'Testing...' : 'Test & Create'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: API Key ── */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                {!createdToken ? (
                  <>
                    <Field label="Token Label" value={tokenLabel} onChange={(e) => setTokenLabel(e.target.value)} placeholder="My API Key" />
                    {wizardError && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{wizardError}</div>}
                    <button
                      onClick={handleGenerateToken}
                      disabled={wizardSaving}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {wizardSaving ? 'Generating...' : 'Generate API Key'}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3">
                      <p className="text-sm font-medium text-yellow-500">Save this token now — it will not be shown again!</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-900 rounded-lg text-xs font-mono text-gray-900 dark:text-white break-all">
                        {createdToken}
                      </code>
                      <button
                        onClick={copyToken}
                        className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        {tokenCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </>
                )}
                <div className="flex justify-between pt-2">
                  <div />
                  <button
                    onClick={() => setWizardStep(3)}
                    disabled={!createdToken}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: API Selection ── */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={apiSearch}
                    onChange={(e) => setApiSearch(e.target.value)}
                    placeholder="Search APIs..."
                    className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder-gray-400"
                  />
                  <button
                    onClick={toggleAllApis}
                    className="shrink-0 px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg transition-colors"
                  >
                    {filteredApis().every(a => selectedApiIds.has(a.id)) ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-xs text-gray-400 shrink-0">{selectedApiIds.size} selected</span>
                </div>

                {apisLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="max-h-[40vh] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredApis().length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-400 text-sm">No APIs found. Import API definitions in the Registry first.</div>
                    ) : filteredApis().map(a => (
                      <label
                        key={a.id}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                          selectedApiIds.has(a.id) ? 'bg-blue-500/5' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedApiIds.has(a.id)}
                          onChange={() => toggleApi(a.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${METHOD_COLORS[a.method] || 'bg-gray-500/15 text-gray-400'}`}>
                          {a.method}
                        </span>
                        <span className="font-mono text-xs text-gray-900 dark:text-white">{a.slug}</span>
                        <span className="text-xs text-gray-400 truncate">{a.name}</span>
                        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">{a.path}</span>
                      </label>
                    ))}
                  </div>
                )}

                {wizardError && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{wizardError}</div>}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setWizardStep(2)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Back</button>
                  <button
                    onClick={handleStep3Advance}
                    disabled={selectedApiIds.size === 0 || wizardSaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {wizardSaving ? 'Assigning...' : `Assign ${selectedApiIds.size} API${selectedApiIds.size !== 1 ? 's' : ''} & Continue`}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 4: Parameters ── */}
            {wizardStep === 4 && (
              <div className="space-y-4">
                {extractedParams.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No query parameters found in the selected APIs.
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Set default values for the {extractedParams.length} parameters used across your {selectedApiIds.size} selected APIs. These will appear in the generated output.
                    </p>
                    <div className="max-h-[50vh] overflow-y-auto space-y-3">
                      {extractedParams.map(p => (
                        <div key={p.name} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-2 mb-1.5">
                            <code className="text-sm font-mono font-medium text-gray-900 dark:text-white">{p.name}</code>
                            <span className="text-[10px] text-gray-400">({p.type})</span>
                            {p.required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">required</span>}
                            <span className="ml-auto text-[10px] text-gray-400">{p.usedBy.length} API{p.usedBy.length !== 1 ? 's' : ''}</span>
                          </div>
                          {p.description && <p className="text-xs text-gray-400 mb-1.5">{p.description}</p>}
                          <input
                            type="text"
                            value={paramDefaults[p.name] || ''}
                            onChange={(e) => setParamDefaults(prev => ({ ...prev, [p.name]: e.target.value }))}
                            placeholder={p.example || `Enter ${p.name}...`}
                            className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder-gray-400"
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setWizardStep(3)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Back</button>
                  <button
                    onClick={() => setWizardStep(5)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Generate Output
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 5: Output ── */}
            {wizardStep === 5 && (
              <div className="space-y-4">
                {/* Gateway URL */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Gateway URL</label>
                  <input
                    type="text"
                    value={gatewayUrl}
                    onChange={(e) => setGatewayUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm"
                  />
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
                  <button
                    onClick={() => { setOutputTab('json'); setOutputCopied(false); }}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      outputTab === 'json'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Tools JSON
                  </button>
                  <button
                    onClick={() => { setOutputTab('prompt'); setOutputCopied(false); }}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      outputTab === 'prompt'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Prompt Spec
                  </button>
                </div>

                {/* Preview */}
                <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 overflow-auto max-h-[40vh] whitespace-pre-wrap">
                  {getOutputContent()}
                </pre>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <button onClick={() => setWizardStep(4)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Back</button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyOutput}
                      className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      {outputCopied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={downloadOutput}
                      className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => { setShowWizard(false); reload(); }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Modal ────────────────────────────────── */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Connection</h2>
            {editError && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{editError}</div>}

            <Field label="Name" value={editForm.name} onChange={editSet('name')} placeholder="Haribo Prod" />
            <Field label="SAP Base URL" value={editForm.sapBaseUrl} onChange={editSet('sapBaseUrl')} placeholder="https://api.eu20.dmc.cloud.sap" />
            <Field label="Token URL" value={editForm.tokenUrl} onChange={editSet('tokenUrl')} placeholder="https://...authentication.../oauth/token" />
            <Field label="Client ID" value={editForm.clientId} onChange={editSet('clientId')} />
            <Field label="Client Secret (leave empty to keep)" value={editForm.clientSecret} onChange={editSet('clientSecret')} type="password" />

            <hr className="border-gray-200 dark:border-gray-700" />
            <p className="text-xs text-gray-400 dark:text-gray-500">Agent configuration (optional)</p>
            <Field label="Agent API URL" value={editForm.agentApiUrl} onChange={editSet('agentApiUrl')} placeholder="https://studio-api.ai.syntax-rnd.com" />
            <Field label="Agent API Key (leave empty to keep)" value={editForm.agentApiKey} onChange={editSet('agentApiKey')} type="password" />

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
              <button onClick={handleEditSubmit} disabled={editSaving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                {editSaving ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">SAP Base URL</th>
                <th className="px-5 py-3 font-medium">Agent</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!connections?.length && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">No connections yet</td></tr>
              )}
              {connections?.map(conn => (
                <tr key={conn.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-5 py-3 text-gray-900 dark:text-white font-medium">{conn.name}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs truncate max-w-[250px]">{conn.sap_base_url}</td>
                  <td className="px-5 py-3">
                    {conn.has_agent_config
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">Configured</span>
                      : <span className="text-xs text-gray-400 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${conn.is_active ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${conn.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                      {conn.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Btn onClick={() => handleTest(conn.id)}>
                        {testResult[conn.id] === 'testing...' ? '...' : testResult[conn.id] === 'ok' ? 'OK' : 'Test'}
                      </Btn>
                      <Btn onClick={() => openEdit(conn)}>Edit</Btn>
                      <Btn onClick={() => handleDelete(conn.id, conn.name)} danger>Delete</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Shared components ──────────────────────────────────── */

function Field({ label, type = 'text', required, ...props }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        {...props}
      />
    </div>
  );
}

function Btn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
