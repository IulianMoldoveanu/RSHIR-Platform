'use client';

// RSHIR-52: Client component for the integrations settings page.
// Handles provider add/remove, API key create/revoke, and the
// "show key once" modal with copy button.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plug } from 'lucide-react';
import { EmptyState } from '@hir/ui';
import {
  addProvider,
  removeProvider,
  createApiKey,
  revokeApiKey,
} from './actions';

type Provider = {
  id: string;
  provider_key: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
};

type ApiKey = {
  id: string;
  label: string;
  scopes: string[];
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
};

type Props = {
  tenantId: string;
  canEdit: boolean;
  providers: Provider[];
  apiKeys: ApiKey[];
};

const PROVIDER_OPTIONS = [
  { value: 'mock', label: 'Mock (test)' },
  { value: 'iiko', label: 'iiko' },
  { value: 'smartcash', label: 'SmartCash' },
  { value: 'freya', label: 'Freya' },
  { value: 'posnet', label: 'Posnet' },
  { value: 'custom', label: 'Custom' },
] as const;

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ------- Add Provider Form -------

function AddProviderForm({
  tenantId,
  onDone,
}: {
  tenantId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [providerKey, setProviderKey] = useState<string>(PROVIDER_OPTIONS[0].value);
  const [displayName, setDisplayName] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const generateSecret = () => {
    setWebhookSecret(crypto.randomUUID());
  };

  const submit = () => {
    if (!displayName.trim()) {
      setError('Completați numele de afișare.');
      return;
    }
    setError(null);
    start(async () => {
      const r = await addProvider(tenantId, providerKey, displayName.trim(), {}, webhookSecret);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      <p className="text-sm font-medium text-zinc-900">Adaugă furnizor</p>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600" htmlFor="provider-key">
          Tip furnizor
        </label>
        <select
          id="provider-key"
          value={providerKey}
          onChange={(e) => setProviderKey(e.target.value)}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          {PROVIDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600" htmlFor="display-name">
          Nume afișare
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="ex. Freya POS loc. 1"
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600" htmlFor="webhook-secret">
          Secret webhook (HMAC)
        </label>
        <div className="flex gap-2">
          <input
            id="webhook-secret"
            type="text"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Generează sau introdu manual"
            className="flex-1 rounded-md border border-zinc-200 px-3 py-2 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="button"
            onClick={generateSecret}
            className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Generează
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-700">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? 'Se salvează…' : 'Salvează furnizor'}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Anulează
        </button>
      </div>
    </div>
  );
}

// ------- Create API Key Form -------

function CreateApiKeyForm({
  tenantId,
  onCreated,
  onCancel,
}: {
  tenantId: string;
  onCreated: (rawKey: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!label.trim()) {
      setError('Completați eticheta cheii.');
      return;
    }
    setError(null);
    start(async () => {
      const r = await createApiKey(tenantId, label.trim(), ['orders.write']);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCreated(r.rawKey);
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5">
      <p className="text-sm font-medium text-zinc-900">Generează cheie API</p>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-600" htmlFor="key-label">
          Etichetă (ex. &quot;POS loc. 1&quot;)
        </label>
        <input
          id="key-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="ex. POS loc. 1"
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      <p className="text-xs text-zinc-500">
        Scopuri: <code className="text-violet-700">orders.write</code> (implicit — singura opțiune MVP).
      </p>

      {error && <p className="text-xs text-rose-700">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? 'Se generează…' : 'Generează cheie API'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Anulează
        </button>
      </div>
    </div>
  );
}

// ------- "Show key once" Modal -------

function ShowKeyModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const copy = async () => {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
  };

  const close = () => {
    router.refresh();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id="modal-title" className="text-base font-semibold text-zinc-900">
          Cheie API generată
        </h2>
        <p className="mt-2 text-sm text-rose-700 font-medium">
          Aceasta este singura dată când vei vedea această cheie. Copiaz-o acum.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs break-all whitespace-pre-wrap text-zinc-900">
          {rawKey}
        </pre>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            {copied ? 'Copiat!' : 'Copiază cheia'}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Închide
          </button>
        </div>
      </div>
    </div>
  );
}

// ------- Main Client Component -------

export function IntegrationsClient({ tenantId, canEdit, providers, apiKeys }: Props) {
  const router = useRouter();
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, start] = useTransition();

  const handleRemoveProvider = (id: string) => {
    setActionError(null);
    setRemovingId(id);
    start(async () => {
      const r = await removeProvider(tenantId, id);
      setRemovingId(null);
      if (!r.ok) {
        setActionError(r.error);
        return;
      }
      router.refresh();
    });
  };

  const handleRevokeKey = (id: string) => {
    setActionError(null);
    setRevokingId(id);
    start(async () => {
      const r = await revokeApiKey(tenantId, id);
      setRevokingId(null);
      if (!r.ok) {
        setActionError(r.error);
        return;
      }
      router.refresh();
    });
  };

  const showOnboarding =
    providers.length === 0 &&
    apiKeys.length === 0 &&
    !showAddProvider &&
    !showCreateKey;

  return (
    <div className="flex flex-col gap-8">
      {showOnboarding && (
        <EmptyState
          icon={<Plug className="h-10 w-10" />}
          title="Nicio integrare configurată încă"
          description="Conectează un POS extern (Mock, Freya, iiko, SmartCash) sau generează o cheie API pentru ca un sistem terț să trimită comenzi în HIR. Toate evenimentele trec prin coada noastră de dispatch cu retry și audit log."
          hint={
            canEdit
              ? 'Începe cu „Adaugă furnizor" pentru a conecta un POS, sau „Generează cheie API" pentru a permite POST către /api/public/v1/orders.'
              : 'Doar utilizatorii cu rolul OWNER pot configura integrări.'
          }
          action={
            canEdit ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddProvider(true)}
                  className="rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700"
                >
                  Adaugă furnizor
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateKey(true)}
                  className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Generează cheie API
                </button>
              </div>
            ) : undefined
          }
        />
      )}

      {/* Providers section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Furnizori POS</h2>
          {canEdit && !showAddProvider && (
            <button
              type="button"
              onClick={() => setShowAddProvider(true)}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            >
              Adaugă furnizor
            </button>
          )}
        </div>

        {showAddProvider && canEdit && (
          <AddProviderForm
            tenantId={tenantId}
            onDone={() => setShowAddProvider(false)}
          />
        )}

        {providers.length === 0 && !showAddProvider && !showOnboarding && (
          <p className="text-sm text-zinc-500">
            Niciun furnizor configurat.{' '}
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowAddProvider(true)}
                className="text-violet-600 underline"
              >
                Adaugă furnizor
              </button>
            )}
          </p>
        )}

        {providers.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Furnizor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Cheie</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Creat</th>
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {providers.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium text-zinc-900">{p.display_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">{p.provider_key}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {p.is_active ? 'Activ' : 'Inactiv'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{fmt(p.created_at)}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveProvider(p.id)}
                          disabled={removingId === p.id}
                          className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          aria-label={`Șterge furnizor ${p.display_name}`}
                        >
                          {removingId === p.id ? 'Se șterge…' : 'Șterge'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* API Keys section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Chei API</h2>
          {canEdit && !showCreateKey && (
            <button
              type="button"
              onClick={() => setShowCreateKey(true)}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            >
              Generează cheie API
            </button>
          )}
        </div>

        {showCreateKey && canEdit && (
          <CreateApiKeyForm
            tenantId={tenantId}
            onCreated={(raw) => {
              setShowCreateKey(false);
              setNewRawKey(raw);
            }}
            onCancel={() => setShowCreateKey(false)}
          />
        )}

        {apiKeys.length === 0 && !showCreateKey && !showOnboarding && (
          <p className="text-sm text-zinc-500">Nicio cheie API generată.</p>
        )}

        {apiKeys.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Etichetă</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Scopuri</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Ultima utilizare</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Status</th>
                  {canEdit && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-4 py-3 font-medium text-zinc-900">{k.label}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                      {k.scopes.join(', ')}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{fmt(k.last_used_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          k.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {k.is_active ? 'Activă' : 'Revocată'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        {k.is_active && (
                          <button
                            type="button"
                            onClick={() => handleRevokeKey(k.id)}
                            disabled={revokingId === k.id}
                            className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            aria-label={`Revocă cheia ${k.label}`}
                          >
                            {revokingId === k.id ? 'Se revocă…' : 'Revocă'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {actionError && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Eroare: {actionError}
        </p>
      )}

      {newRawKey && (
        <ShowKeyModal rawKey={newRawKey} onClose={() => setNewRawKey(null)} />
      )}
    </div>
  );
}
