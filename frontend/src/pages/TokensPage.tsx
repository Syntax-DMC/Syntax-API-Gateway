import { useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import type { ApiToken, SapConnection } from '../types';

export default function TokensPage() {
  const { t, locale } = useI18n();
  const { data: tokens, reload } = useApi<ApiToken[]>('/api/tokens');
  const { data: connections } = useApi<SapConnection[]>('/api/connections');
  const [showCreate, setShowCreate] = useState(false);
  const [connId, setConnId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function openCreate() {
    setConnId(connections?.[0]?.id || '');
    setLabel('');
    setError('');
    setCreatedToken(null);
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!connId || !label) { setError(t('tokens.connectionAndLabelRequired')); return; }
    setSaving(true);
    setError('');
    try {
      const result = await api<{ token: string }>('/api/tokens', 'POST', { sapConnectionId: connId, label });
      setCreatedToken(result.token);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string, prefix: string) {
    if (!confirm(t('tokens.revokeConfirm', { prefix }))) return;
    try {
      await api(`/api/tokens/${id}`, 'DELETE');
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      await api(`/api/tokens/${id}`, 'PATCH', { is_active: !active });
      reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function copyToken() {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('tokens.title')}</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          {t('tokens.newToken')}
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('tokens.createTitle')}</h2>

            {createdToken ? (
              <div className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3">
                  <p className="text-yellow-400 text-sm font-medium">{t('tokens.saveTokenWarning')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-100 dark:bg-gray-900 text-green-400 px-3 py-2 rounded-lg text-sm font-mono break-all">{createdToken}</code>
                  <button onClick={copyToken} className="shrink-0 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-sm rounded-lg transition-colors">
                    {copied ? t('common.copied') : t('common.copy')}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                    {t('common.close')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {error && <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-2">{error}</div>}

                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('tokens.connectionLabel')}</label>
                  <select
                    value={connId}
                    onChange={e => setConnId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{t('tokens.selectConnection')}</option>
                    {connections?.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">{t('tokens.labelField')}</label>
                  <input
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="POD Plugin Prod"
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">{t('common.cancel')}</button>
                  <button onClick={handleCreate} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                    {saving ? t('common.creating') : t('tokens.createToken')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tokens table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="px-5 py-3 font-medium">{t('tokens.tokenHeader')}</th>
                <th className="px-5 py-3 font-medium">{t('common.label')}</th>
                <th className="px-5 py-3 font-medium">{t('common.connection')}</th>
                <th className="px-5 py-3 font-medium">{t('common.status')}</th>
                <th className="px-5 py-3 font-medium">{t('tokens.requestsHeader')}</th>
                <th className="px-5 py-3 font-medium">{t('tokens.lastUsed')}</th>
                <th className="px-5 py-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {!tokens?.length && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">{t('tokens.noTokens')}</td></tr>
              )}
              {tokens?.map(tok => (
                <tr key={tok.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-5 py-3 font-mono text-gray-600 dark:text-gray-300">{tok.token_prefix}...</td>
                  <td className="px-5 py-3 text-gray-900 dark:text-white">{tok.label}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{tok.connection_name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${tok.is_active ? 'text-green-400' : 'text-red-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tok.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                      {tok.is_active ? t('common.active') : t('tokens.revoked')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{Number(tok.request_count).toLocaleString(locale)}</td>
                  <td className="px-5 py-3 text-gray-400 dark:text-gray-500 text-xs">
                    {tok.last_used_at ? new Date(tok.last_used_at).toLocaleString(locale) : t('tokens.never')}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggle(tok.id, tok.is_active)}
                        className="px-2.5 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        {tok.is_active ? t('common.disable') : t('common.enable')}
                      </button>
                      <button
                        onClick={() => handleRevoke(tok.id, tok.token_prefix)}
                        className="px-2.5 py-1 text-xs rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        {t('common.delete')}
                      </button>
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
