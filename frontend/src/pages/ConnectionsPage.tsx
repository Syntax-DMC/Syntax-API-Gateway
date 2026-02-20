import { useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import type { SapConnection } from '../types';

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

type WizardStep = 1 | 2 | 3 | 4;
type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

interface StepTestState {
  status: TestStatus;
  message: string;
  detail?: string; // e.g. "expires in 3600s"
}

const STEPS: { num: WizardStep; label: string }[] = [
  { num: 1, label: 'Basic Info' },
  { num: 2, label: 'OAuth2' },
  { num: 3, label: 'Agent Config' },
  { num: 4, label: 'Review' },
];

export default function ConnectionsPage() {
  const { data: connections, reload } = useApi<SapConnection[]>('/api/connections');

  // Edit modal (flat form)
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormData>(emptyForm);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Wizard (create)
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardForm, setWizardForm] = useState<FormData>(emptyForm);
  const [wizardError, setWizardError] = useState('');
  const [wizardSaving, setWizardSaving] = useState(false);
  const [stepTests, setStepTests] = useState<Record<number, StepTestState>>({});

  // Inline connection test
  const [testResult, setTestResult] = useState<Record<string, string | null>>({});

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
  }

  const wizSet = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setWizardForm(f => ({ ...f, [field]: e.target.value }));
    // Clear test result for current step when fields change
    setStepTests(prev => {
      const copy = { ...prev };
      delete copy[wizardStep];
      return copy;
    });
  };

  async function testStep1() {
    if (!wizardForm.name.trim() || !wizardForm.sapBaseUrl.trim()) {
      setStepTests(prev => ({ ...prev, 1: { status: 'error', message: 'Name and SAP Base URL are required' } }));
      return;
    }
    setStepTests(prev => ({ ...prev, 1: { status: 'testing', message: 'Testing URL reachability...' } }));
    try {
      const res = await api<{ status: string; responseTime?: number; message?: string }>(
        '/api/connections/test-url', 'POST', { url: wizardForm.sapBaseUrl }
      );
      if (res.status === 'ok') {
        setStepTests(prev => ({ ...prev, 1: { status: 'ok', message: 'URL reachable', detail: `${res.responseTime}ms` } }));
        setWizardStep(2);
      } else {
        setStepTests(prev => ({ ...prev, 1: { status: 'error', message: res.message || 'URL not reachable' } }));
      }
    } catch (err) {
      setStepTests(prev => ({ ...prev, 1: { status: 'error', message: (err as Error).message } }));
    }
  }

  async function testStep2() {
    if (!wizardForm.tokenUrl.trim() || !wizardForm.clientId.trim() || !wizardForm.clientSecret.trim()) {
      setStepTests(prev => ({ ...prev, 2: { status: 'error', message: 'All OAuth2 fields are required' } }));
      return;
    }
    setStepTests(prev => ({ ...prev, 2: { status: 'testing', message: 'Fetching OAuth2 token...' } }));
    try {
      const res = await api<{ status: string; expiresIn?: number; message?: string }>(
        '/api/connections/test-oauth', 'POST', {
          token_url: wizardForm.tokenUrl,
          client_id: wizardForm.clientId,
          client_secret: wizardForm.clientSecret,
        }
      );
      if (res.status === 'ok') {
        setStepTests(prev => ({ ...prev, 2: { status: 'ok', message: 'Token fetched successfully', detail: `expires in ${res.expiresIn}s` } }));
        setWizardStep(3);
      } else {
        setStepTests(prev => ({ ...prev, 2: { status: 'error', message: res.message || 'OAuth2 authentication failed' } }));
      }
    } catch (err) {
      setStepTests(prev => ({ ...prev, 2: { status: 'error', message: (err as Error).message } }));
    }
  }

  async function testStep3() {
    if (!wizardForm.agentApiUrl.trim()) {
      // Skip agent config
      setWizardStep(4);
      return;
    }
    if (!wizardForm.agentApiKey.trim()) {
      setStepTests(prev => ({ ...prev, 3: { status: 'error', message: 'Agent API Key is required when URL is set' } }));
      return;
    }
    setStepTests(prev => ({ ...prev, 3: { status: 'testing', message: 'Testing agent endpoint...' } }));
    try {
      const res = await api<{ status: string; message?: string }>(
        '/api/connections/test-agent', 'POST', {
          agent_api_url: wizardForm.agentApiUrl,
          agent_api_key: wizardForm.agentApiKey,
        }
      );
      if (res.status === 'ok') {
        setStepTests(prev => ({ ...prev, 3: { status: 'ok', message: 'Agent endpoint reachable' } }));
        setWizardStep(4);
      } else {
        setStepTests(prev => ({ ...prev, 3: { status: 'error', message: res.message || 'Agent endpoint not reachable' } }));
      }
    } catch (err) {
      setStepTests(prev => ({ ...prev, 3: { status: 'error', message: (err as Error).message } }));
    }
  }

  function skipStep3() {
    setWizardForm(f => ({ ...f, agentApiUrl: '', agentApiKey: '' }));
    setStepTests(prev => {
      const copy = { ...prev };
      delete copy[3];
      return copy;
    });
    setWizardStep(4);
  }

  async function handleWizardCreate() {
    setWizardSaving(true);
    setWizardError('');
    try {
      const body: Record<string, string | undefined> = { ...wizardForm };
      if (!body.agentApiUrl) { delete body.agentApiUrl; delete body.agentApiKey; }
      await api('/api/connections', 'POST', body);
      setShowWizard(false);
      reload();
    } catch (err) {
      setWizardError((err as Error).message);
    } finally {
      setWizardSaving(false);
    }
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

  // ── Step indicator ─────────────────────────────────────

  function StepIndicator() {
    return (
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((step, i) => {
          const isActive = wizardStep === step.num;
          const isCompleted = wizardStep > step.num;
          const testState = stepTests[step.num];
          return (
            <div key={step.num} className="flex items-center flex-1">
              <div className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  isActive ? 'bg-blue-600 text-white' :
                  isCompleted ? (testState?.status === 'ok' ? 'bg-green-500 text-white' : 'bg-blue-200 dark:bg-blue-900 text-blue-700 dark:text-blue-300') :
                  'bg-gray-200 dark:bg-gray-700 text-gray-400'
                }`}>
                  {isCompleted && testState?.status === 'ok' ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : step.num}
                </div>
                <span className={`text-xs font-medium truncate ${
                  isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                }`}>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-0.5 mx-1 shrink-0 ${isCompleted ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Test result badge ──────────────────────────────────

  function TestBadge({ state }: { state?: StepTestState }) {
    if (!state) return null;
    if (state.status === 'testing') {
      return (
        <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-sm text-blue-400">{state.message}</span>
        </div>
      );
    }
    if (state.status === 'ok') {
      return (
        <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm text-green-400">{state.message}</span>
          {state.detail && <span className="text-xs text-green-500/70 ml-auto">{state.detail}</span>}
        </div>
      );
    }
    if (state.status === 'error') {
      return (
        <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-sm text-red-400">{state.message}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SAP Connections</h1>
        <button onClick={openWizard} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          New Connection
        </button>
      </div>

      {/* ── Create Wizard ─────────────────────────────── */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">New Connection</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Step-by-step guided setup with automatic validation</p>

            <StepIndicator />

            {/* Step 1: Basic Info */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <Field label="Connection Name" value={wizardForm.name} onChange={wizSet('name')} placeholder="My SAP DM Production" />
                <Field label="SAP Base URL" value={wizardForm.sapBaseUrl} onChange={wizSet('sapBaseUrl')} placeholder="https://api.eu20.dmc.cloud.sap" />
                <TestBadge state={stepTests[1]} />
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowWizard(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
                  <button
                    onClick={testStep1}
                    disabled={stepTests[1]?.status === 'testing'}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {stepTests[1]?.status === 'testing' ? 'Testing...' : 'Test & Continue'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: OAuth2 Credentials */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <Field label="Token URL" value={wizardForm.tokenUrl} onChange={wizSet('tokenUrl')} placeholder="https://...authentication.../oauth/token" />
                <Field label="Client ID" value={wizardForm.clientId} onChange={wizSet('clientId')} />
                <Field label="Client Secret" value={wizardForm.clientSecret} onChange={wizSet('clientSecret')} type="password" />
                <TestBadge state={stepTests[2]} />
                <div className="flex justify-between pt-2">
                  <button onClick={() => setWizardStep(1)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Back</button>
                  <button
                    onClick={testStep2}
                    disabled={stepTests[2]?.status === 'testing'}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {stepTests[2]?.status === 'testing' ? 'Testing...' : 'Test & Continue'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Agent Config */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-gray-400 dark:text-gray-500">Optional — configure if you want to proxy requests to an AI agent</p>
                <Field label="Agent API URL" value={wizardForm.agentApiUrl} onChange={wizSet('agentApiUrl')} placeholder="https://studio-api.ai.syntax-rnd.com" />
                <Field label="Agent API Key" value={wizardForm.agentApiKey} onChange={wizSet('agentApiKey')} type="password" />
                <TestBadge state={stepTests[3]} />
                <div className="flex justify-between pt-2">
                  <button onClick={() => setWizardStep(2)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Back</button>
                  <div className="flex gap-2">
                    <button onClick={skipStep3} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg transition-colors">
                      Skip
                    </button>
                    <button
                      onClick={testStep3}
                      disabled={stepTests[3]?.status === 'testing'}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {stepTests[3]?.status === 'testing' ? 'Testing...' : 'Test & Continue'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Review & Create */}
            {wizardStep === 4 && (
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                  <ReviewRow label="Name" value={wizardForm.name} tested={stepTests[1]?.status === 'ok'} />
                  <ReviewRow label="SAP Base URL" value={wizardForm.sapBaseUrl} tested={stepTests[1]?.status === 'ok'} />
                  <ReviewRow label="Token URL" value={wizardForm.tokenUrl} tested={stepTests[2]?.status === 'ok'} />
                  <ReviewRow label="Client ID" value={wizardForm.clientId} tested={stepTests[2]?.status === 'ok'} />
                  <ReviewRow label="Client Secret" value="••••••••" tested={stepTests[2]?.status === 'ok'} />
                  {wizardForm.agentApiUrl ? (
                    <>
                      <ReviewRow label="Agent API URL" value={wizardForm.agentApiUrl} tested={stepTests[3]?.status === 'ok'} />
                      <ReviewRow label="Agent API Key" value="••••••••" tested={stepTests[3]?.status === 'ok'} />
                    </>
                  ) : (
                    <ReviewRow label="Agent Config" value="Not configured" />
                  )}
                </div>

                {wizardError && (
                  <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{wizardError}</div>
                )}

                <div className="flex justify-between pt-2">
                  <button onClick={() => setWizardStep(wizardForm.agentApiUrl ? 3 : 2)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Back</button>
                  <button
                    onClick={handleWizardCreate}
                    disabled={wizardSaving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {wizardSaving ? 'Creating...' : 'Create Connection'}
                  </button>
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

function ReviewRow({ label, value, tested }: { label: string; value: string; tested?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-900 dark:text-white font-mono">{value}</span>
        {tested && (
          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
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
