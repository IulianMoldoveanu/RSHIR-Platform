'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Check, ExternalLink, X } from 'lucide-react';

export type TenantOption = {
  id: string;
  name: string;
  slug: string;
  deliveryMode: 'full_saas' | 'headless';
};

type OnboardSuccess = {
  endpointId: string;
  webhookUrl: string;
  signingSecret: string;
  events: string[];
  tenant: { id: string; slug: string; name: string };
};

export function ConnectOnboardClient({ tenants }: { tenants: TenantOption[] }) {
  const [tenantQuery, setTenantQuery] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardSuccess | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = tenantQuery.trim().toLowerCase();
    if (!q) return tenants.slice(0, 50);
    return tenants
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [tenants, tenantQuery]);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);
  const alreadyHeadless = selectedTenant?.deliveryMode === 'headless';

  const handleSubmit = () => {
    setError(null);
    if (!selectedTenantId) {
      setError('Selectează un tenant.');
      return;
    }
    if (!webhookUrl.trim()) {
      setError('Introdu URL-ul webhook.');
      return;
    }
    if (!webhookUrl.startsWith('https://')) {
      setError('URL-ul trebuie să înceapă cu https://');
      return;
    }
    try {
      new URL(webhookUrl);
    } catch {
      setError('URL invalid.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/v1/connect/onboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: selectedTenantId,
            webhook_url: webhookUrl.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(
            data?.error === 'endpoint_exists'
              ? 'Acest tenant are deja un webhook activ. Folosește ecranul de rotire din dashboard-ul restaurantului.'
              : data?.error === 'tenant_not_found'
                ? 'Tenant negăsit.'
                : `Eroare: ${data?.error || res.statusText}`,
          );
          return;
        }
        setResult({
          endpointId: data.endpoint_id,
          webhookUrl: data.webhook_url,
          signingSecret: data.signing_secret,
          events: data.events,
          tenant: data.tenant,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare necunoscută.');
      }
    });
  };

  const copySecret = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.signingSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  if (result) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-emerald-600" aria-hidden />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-emerald-900">
              HIR Connect activat pentru {result.tenant.name}
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              Tenant <code className="rounded bg-white/60 px-1 font-mono text-xs">{result.tenant.slug}</code> este
              acum în mod <code className="rounded bg-white/60 px-1 font-mono text-xs">headless</code>. Dashboard-ul
              lor afișează sidebar restricționat + badge HIR Connect.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setSelectedTenantId('');
              setWebhookUrl('');
              setTenantQuery('');
            }}
            className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
            aria-label="Închide"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            ⚠️ Signing secret — afișat O SINGURĂ DATĂ
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Trimite-l acum patronului (Signal/Telegram/email criptat). Nu îl mai
            putem afișa după ce închizi această fereastră. Dacă îl pierzi, va
            trebui rotit din dashboard-ul restaurantului.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-zinc-900">
              {result.signingSecret}
            </code>
            <button
              type="button"
              onClick={copySecret}
              className="inline-flex flex-none items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              {copiedSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedSecret ? 'Copiat' : 'Copiază'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-zinc-200 bg-white p-4 text-xs">
            <div className="font-semibold text-zinc-900">Webhook URL configurat</div>
            <code className="mt-1 block break-all font-mono text-zinc-700">{result.webhookUrl}</code>
          </div>
          <div className="rounded-md border border-zinc-200 bg-white p-4 text-xs">
            <div className="font-semibold text-zinc-900">Evenimente trimise</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {result.events.map((e) => (
                <span
                  key={e}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-700"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-zinc-200 bg-white p-4 text-xs">
          <div className="font-semibold text-zinc-900">Pași următori pentru patron</div>
          <ol className="mt-2 ml-4 list-decimal space-y-1 text-zinc-700">
            <li>Salvează signing secret-ul pe site (env var / wp-config.php constantă).</li>
            <li>Implementează verificarea semnăturii (vezi /dashboard/settings/integrations/webhooks pentru exemple cod).</li>
            <li>
              Pentru WordPress: instalează plugin-ul HIR Connect (zip în{' '}
              <code className="rounded bg-zinc-100 px-1 font-mono">integrations/wordpress/hir-connect/</code>).
            </li>
            <li>Test cu o comandă de probă; verifică livrarea în panel-ul lor.</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <label className="block">
          <div className="text-sm font-semibold text-zinc-900">1. Selectează tenant-ul</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Caută după nume, slug sau ID. Doar tenanți cu status ACTIVE sunt afișați.
          </div>
          <input
            type="text"
            value={tenantQuery}
            onChange={(e) => setTenantQuery(e.target.value)}
            placeholder="ex: deliveryhouse"
            className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </label>

        {filtered.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            Niciun tenant găsit pentru &ldquo;{tenantQuery}&rdquo;.{' '}
            <a
              href="/dashboard/admin/onboard"
              className="font-medium text-violet-700 hover:text-violet-800"
            >
              Creează tenant nou →
            </a>
          </p>
        ) : (
          <ul className="mt-3 max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-200">
            {filtered.map((t) => {
              const isSelected = selectedTenantId === t.id;
              const isAlreadyHeadless = t.deliveryMode === 'headless';
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTenantId(t.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      isSelected ? 'bg-violet-50' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-zinc-900">{t.name}</div>
                      <div className="truncate font-mono text-[11px] text-zinc-500">
                        {t.slug} · {t.id.slice(0, 8)}
                      </div>
                    </div>
                    {isAlreadyHeadless && (
                      <span className="flex-none rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800">
                        HIR Connect activ
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <label className="block">
          <div className="text-sm font-semibold text-zinc-900">2. URL webhook al site-ului</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            HIR va POSTa evenimentele order.* la acest endpoint, semnate HMAC-SHA256.
          </div>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://exemplu.ro/api/hir/webhook"
            className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          Plugin-ul WordPress HIR Connect expune automat ruta{' '}
          <code className="rounded bg-zinc-100 px-1 font-mono">/wp-json/hir/v1/webhook</code>.
        </p>
      </div>

      {alreadyHeadless && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Acest tenant este deja în mod HIR Connect. Dacă ai nevoie de un secret nou,
          rotește-l din{' '}
          <code className="rounded bg-white px-1 font-mono text-xs">
            /dashboard/settings/integrations/webhooks
          </code>{' '}
          în contul lor. Submit-ul aici va eșua cu &bdquo;endpoint exists&rdquo;.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !selectedTenantId || !webhookUrl}
          className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? 'Activez…' : 'Activează HIR Connect'}
        </button>
        <a
          href="/connect"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
        >
          Vezi pagina publică /connect
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
