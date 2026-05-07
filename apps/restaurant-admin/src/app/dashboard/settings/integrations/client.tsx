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
  testCustomWebhook,
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

type IntegrationEvent = {
  id: number;
  provider_key: string;
  event_type: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'DEAD';
  attempts: number;
  last_error: string | null;
  scheduled_for: string;
  sent_at: string | null;
  created_at: string;
};

type Props = {
  tenantId: string;
  canEdit: boolean;
  providers: Provider[];
  apiKeys: ApiKey[];
  events: IntegrationEvent[];
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

// Order-status enum exposed to the operator. Mirrors the Custom adapter
// VALID_STATUSES set in @hir/integration-core. Keep in sync.
const CUSTOM_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'NEW', label: 'Nouă' },
  { value: 'PREPARING', label: 'În pregătire' },
  { value: 'READY', label: 'Gata' },
  { value: 'DISPATCHED', label: 'Plecată' },
  { value: 'DELIVERED', label: 'Livrată' },
  { value: 'CANCELLED', label: 'Anulată' },
];

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
  const [webhookUrl, setWebhookUrl] = useState('');
  const [fireOnStatuses, setFireOnStatuses] = useState<string[]>([
    'NEW',
    'DELIVERED',
    'CANCELLED',
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const generateSecret = () => {
    setWebhookSecret(crypto.randomUUID());
  };

  const isCustom = providerKey === 'custom';

  const toggleStatus = (s: string) => {
    setFireOnStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  // "Datecs FP-700 (companion)" preset — pre-fills the Custom-webhook
  // form with sane defaults for the desktop companion at
  // tools/datecs-companion. The operator still has to paste the real
  // tunnel URL (Cloudflare Tunnel / ngrok / Tailscale Funnel) and
  // copy the generated secret into the companion's .env file.
  // Defaults to DELIVERED-only because that's the regulatory moment a
  // bon fiscal must be issued; tenants can enable READY too if they
  // want a kitchen-side print.
  const applyDatecsPreset = () => {
    setDisplayName((prev) => prev || 'Datecs FP-700 (companion)');
    setWebhookUrl('https://YOUR-TUNNEL-URL/print');
    setFireOnStatuses(['DELIVERED']);
    if (webhookSecret.length < 16) {
      setWebhookSecret(crypto.randomUUID());
    }
    setError(null);
  };

  const submit = () => {
    if (!displayName.trim()) {
      setError('Completați numele de afișare.');
      return;
    }
    if (webhookSecret.length < 16) {
      setError('Secretul webhook trebuie să aibă minim 16 caractere.');
      return;
    }
    if (isCustom) {
      if (!webhookUrl.trim()) {
        setError('Completați URL-ul webhook.');
        return;
      }
      if (!webhookUrl.trim().toLowerCase().startsWith('https://')) {
        setError('URL-ul webhook trebuie să fie HTTPS.');
        return;
      }
      if (fireOnStatuses.length === 0) {
        setError('Selectați cel puțin un status pentru care să trimitem webhook.');
        return;
      }
    }
    setError(null);
    const config: Record<string, unknown> = isCustom
      ? { webhook_url: webhookUrl.trim(), fire_on_statuses: fireOnStatuses }
      : {};
    start(async () => {
      const r = await addProvider(tenantId, providerKey, displayName.trim(), config, webhookSecret);
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

      {isCustom && (
        <>
          <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
            <p className="text-xs font-medium text-violet-900">Presetări rapide</p>
            <p className="mt-1 text-[11px] text-violet-700">
              Apasă pe o presetare pentru a pre-completa formularul. Schimbi pe urmă URL-ul cu cel real.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyDatecsPreset}
                className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
              >
                Datecs FP-700 (companion)
              </button>
            </div>
            <p className="mt-2 text-[11px] text-violet-700">
              Pentru imprimanta fiscală Datecs (FP-700, FP-2000, FMP-350, DP-50): rulezi aplicația companion pe PC-ul restaurantului și o expui prin Cloudflare Tunnel / ngrok / Tailscale Funnel. Vezi <code className="text-violet-900">tools/datecs-companion/README.md</code>.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-600" htmlFor="webhook-url">
              URL webhook (HTTPS)
            </label>
            <input
              id="webhook-url"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://exemplu.ro/hir-webhook"
              className="rounded-md border border-zinc-200 px-3 py-2 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-[11px] text-zinc-500">
              Trimitem POST cu antet <code className="text-violet-700">X-HIR-Signature</code> (HMAC-SHA256). Doar HTTPS, fără adrese interne (10.x, 192.168.x, localhost).
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-600">Trimite webhook la</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CUSTOM_STATUS_OPTIONS.map((s) => (
                <label
                  key={s.value}
                  className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={fireOnStatuses.includes(s.value)}
                    onChange={() => toggleStatus(s.value)}
                    className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

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
            placeholder="Generează sau introdu manual (min. 16 caractere)"
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

const STATUS_LABELS: Record<IntegrationEvent['status'], { label: string; cls: string }> = {
  PENDING: { label: 'În așteptare', cls: 'bg-amber-50 text-amber-700' },
  SENT: { label: 'Trimis', cls: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Eșuat (retry)', cls: 'bg-rose-50 text-rose-700' },
  DEAD: { label: 'Renunțat', cls: 'bg-zinc-200 text-zinc-700' },
};

export function IntegrationsClient({ tenantId, canEdit, providers, apiKeys, events }: Props) {
  const router = useRouter();
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, start] = useTransition();

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    { providerId: string; ok: boolean; message: string } | null
  >(null);

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

  const handleTestWebhook = (id: string) => {
    setActionError(null);
    setTestResult(null);
    setTestingId(id);
    start(async () => {
      const r = await testCustomWebhook(tenantId, id);
      setTestingId(null);
      if (r.ok) {
        setTestResult({
          providerId: id,
          ok: true,
          message: `Webhook livrat în ${r.latencyMs} ms (HTTP ${r.httpStatus}).`,
        });
      } else {
        setTestResult({ providerId: id, ok: false, message: r.error });
      }
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
                        <div className="flex items-center justify-end gap-1">
                          {p.provider_key === 'custom' && (
                            <button
                              type="button"
                              onClick={() => handleTestWebhook(p.id)}
                              disabled={testingId === p.id}
                              className="rounded px-2 py-1 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                              aria-label={`Testează conexiunea pentru ${p.display_name}`}
                            >
                              {testingId === p.id ? 'Se testează…' : 'Testează'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveProvider(p.id)}
                            disabled={removingId === p.id}
                            className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            aria-label={`Șterge furnizor ${p.display_name}`}
                          >
                            {removingId === p.id ? 'Se șterge…' : 'Șterge'}
                          </button>
                        </div>
                        {testResult && testResult.providerId === p.id && (
                          <p
                            className={`mt-1 text-xs ${
                              testResult.ok ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                            role="status"
                          >
                            {testResult.message}
                          </p>
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

      {/* Events / dispatch queue section */}
      {(providers.length > 0 || apiKeys.length > 0 || events.length > 0) && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Evenimente recente</h2>
            <span className="text-xs text-zinc-500">Ultimele 50</span>
          </div>

          {events.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Niciun eveniment de integrare încă. Apar aici imediat ce o comandă sau modificare de meniu este trimisă către un POS conectat.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Când</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Furnizor</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Eveniment</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Încercări</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-600">Eroare</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {events.map((e) => {
                    const meta = STATUS_LABELS[e.status];
                    return (
                      <tr key={e.id}>
                        <td className="px-4 py-2 text-xs text-zinc-500 whitespace-nowrap">{fmt(e.created_at)}</td>
                        <td className="px-4 py-2 font-mono text-xs text-zinc-700">{e.provider_key}</td>
                        <td className="px-4 py-2 font-mono text-xs text-zinc-900">{e.event_type}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs tabular-nums text-zinc-700">{e.attempts}</td>
                        <td className="px-4 py-2 text-xs text-zinc-600 max-w-[280px] truncate" title={e.last_error ?? ''}>
                          {e.last_error ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

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
