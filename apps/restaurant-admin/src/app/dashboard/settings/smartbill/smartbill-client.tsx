'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  retrySmartbillJob,
  saveSmartbillSettings,
  testSmartbillConnection,
  type SmartbillResult,
} from './actions';
import type { SmartbillSettings } from '@/lib/smartbill';

type JobRow = {
  id: string;
  // CLAIMED is the transient state held while the Edge Function is calling
  // SmartBill. Owners can land on this page while a row is in flight, so
  // the UI must render it (caught by Codex P2 round 2 on PR #316).
  status: 'PENDING' | 'CLAIMED' | 'SENT' | 'FAILED' | 'SKIPPED';
  smartbill_invoice_id: string | null;
  smartbill_invoice_number: string | null;
  smartbill_invoice_series: string | null;
  error_text: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  order_id: string;
};

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function errorLabel(result: Extract<SmartbillResult, { ok: false }>): string {
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate modifica integrarea SmartBill.',
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    invalid_input: 'Date invalide. Verificați câmpurile marcate.',
    tenant_mismatch: 'Restaurantul activ s-a schimbat — reîncărcați pagina.',
    db_error: 'Eroare la salvare în baza de date.',
    smartbill_rejected: 'SmartBill a respins cererea.',
    network: 'Eroare de rețea — încercați din nou.',
    misconfigured: 'Configurația platformei lipsește. Anunțați echipa HIR.',
  };
  const base = map[result.error] ?? result.error;
  return result.detail ? `${base} (${result.detail})` : base;
}

const STATUS_PILL_FALLBACK = { label: 'Necunoscut', cls: 'bg-zinc-100 text-zinc-700' };

function StatusPill({ status }: { status: JobRow['status'] }) {
  const map: Record<JobRow['status'], { label: string; cls: string }> = {
    PENDING: { label: 'În așteptare', cls: 'bg-amber-100 text-amber-800' },
    CLAIMED: { label: 'Se trimite…', cls: 'bg-sky-100 text-sky-800' },
    SENT: { label: 'Trimisă', cls: 'bg-emerald-100 text-emerald-800' },
    FAILED: { label: 'Eșuată', cls: 'bg-rose-100 text-rose-800' },
    SKIPPED: { label: 'Omisă', cls: 'bg-zinc-100 text-zinc-700' },
  };
  const m = map[status] ?? STATUS_PILL_FALLBACK;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

const RO_DT = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function fmtDate(iso: string): string {
  try {
    return RO_DT.format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SmartbillClient({
  tenantId,
  canEdit,
  settings,
  hasToken,
  jobs,
}: {
  tenantId: string;
  canEdit: boolean;
  settings: SmartbillSettings;
  hasToken: boolean;
  jobs: JobRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [testPending, startTest] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [autoPush, setAutoPush] = useState(settings.auto_push_enabled);
  const [username, setUsername] = useState(settings.username);
  const [cif, setCif] = useState(settings.cif);
  const [series, setSeries] = useState(settings.series_invoice);
  const [tokenInput, setTokenInput] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(e.currentTarget);
    fd.set('tenantId', tenantId);
    if (clearToken) fd.set('api_token', '__CLEAR__');
    setFeedback(null);
    start(async () => {
      const r = await saveSmartbillSettings(fd);
      if (r.ok) {
        setFeedback({ kind: 'success', message: 'Setările au fost salvate.' });
        setTokenInput('');
        setClearToken(false);
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(r) });
      }
    });
  };

  const onTest = () => {
    if (!canEdit) return;
    setFeedback(null);
    startTest(async () => {
      const r = await testSmartbillConnection(tenantId);
      if (r.ok) {
        setFeedback({
          kind: 'success',
          message: 'Conexiune SmartBill funcțională. Puteți activa trimiterea automată.',
        });
      } else {
        setFeedback({ kind: 'error', message: errorLabel(r) });
      }
      router.refresh();
    });
  };

  const onRetry = (jobId: string) => {
    if (!canEdit) return;
    setRetryingId(jobId);
    setFeedback(null);
    start(async () => {
      const r = await retrySmartbillJob(jobId, tenantId);
      if (r.ok) {
        setFeedback({ kind: 'success', message: 'Trimitere reîncadrată în coadă.' });
      } else {
        setFeedback({ kind: 'error', message: errorLabel(r) });
      }
      setRetryingId(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-md border px-4 py-3 text-sm ${
            feedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Configurare cont</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Datele de autentificare sunt criptate. HIR le folosește exclusiv
                pentru a emite facturi în contul dumneavoastră SmartBill.
              </p>
            </div>
            {settings.last_test_status && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  settings.last_test_status === 'OK'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
                title={
                  settings.last_test_at
                    ? `Ultima verificare: ${fmtDate(settings.last_test_at)}`
                    : undefined
                }
              >
                Conexiune: {settings.last_test_status === 'OK' ? 'OK' : 'Eșec'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">Email cont SmartBill</span>
              <input
                type="email"
                name="username"
                required
                disabled={!canEdit}
                defaultValue={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="contabilitate@restaurant.ro"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">CIF firmă</span>
              <input
                type="text"
                name="cif"
                required
                disabled={!canEdit}
                defaultValue={cif}
                onChange={(e) => setCif(e.target.value)}
                placeholder="RO12345678"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">Serie factură</span>
              <input
                type="text"
                name="series_invoice"
                required
                disabled={!canEdit}
                defaultValue={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder="HIR"
                maxLength={10}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              />
              <span className="text-[11px] text-zinc-500">
                Aceeași serie configurată în SmartBill (ex. HIR, FCT).
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="font-medium text-zinc-700">
                Token API
                {hasToken && !clearToken && (
                  <span className="ml-2 text-[11px] font-normal text-emerald-700">
                    ✓ deja configurat
                  </span>
                )}
              </span>
              <input
                type="password"
                name="api_token"
                disabled={!canEdit || clearToken}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={hasToken ? '•••••••• (lăsați gol pentru a păstra)' : 'lipiți tokenul aici'}
                autoComplete="off"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
              />
              {hasToken && canEdit && (
                <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-zinc-600">
                  <input
                    type="checkbox"
                    checked={clearToken}
                    onChange={(e) => {
                      setClearToken(e.target.checked);
                      if (e.target.checked) setTokenInput('');
                    }}
                  />
                  Șterge tokenul existent
                </label>
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="enabled"
                disabled={!canEdit}
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">
                  Activează integrarea SmartBill
                </span>
                <span className="block text-xs text-zinc-500">
                  Permite HIR să comunice cu contul dumneavoastră SmartBill.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="auto_push_enabled"
                disabled={!canEdit || !enabled}
                checked={autoPush}
                onChange={(e) => setAutoPush(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-900">
                  Trimitere automată la livrare
                </span>
                <span className="block text-xs text-zinc-500">
                  Factura este creată în SmartBill imediat ce comanda devine
                  „Livrată”.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
            <button
              type="submit"
              disabled={!canEdit || pending}
              className="inline-flex items-center rounded-md bg-purple-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Se salvează…' : 'Salvează setările'}
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={!canEdit || testPending || !hasToken}
              title={!hasToken ? 'Salvați mai întâi tokenul API' : undefined}
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {testPending ? 'Se testează…' : 'Testează conexiunea'}
            </button>
            {settings.last_sync_at && (
              <span className="ml-auto text-xs text-zinc-500">
                Ultima factură trimisă: {fmtDate(settings.last_sync_at)}
              </span>
            )}
          </div>
        </div>
      </form>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">
            Ultimele facturi trimise
          </h2>
          <span className="text-xs text-zinc-500">{jobs.length} înregistrări</span>
        </header>
        {jobs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500">
            Nicio factură nu a fost trimisă încă. După activare, comenzile
            livrate vor apărea aici.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-100 text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Data</th>
                  <th className="px-5 py-2 font-medium">Comandă</th>
                  <th className="px-5 py-2 font-medium">Stare</th>
                  <th className="px-5 py-2 font-medium">Factură SmartBill</th>
                  <th className="px-5 py-2 font-medium">Detalii</th>
                  <th className="px-5 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {jobs.map((j) => (
                  <tr key={j.id} className="text-zinc-800">
                    <td className="whitespace-nowrap px-5 py-2 text-xs text-zinc-600">
                      {fmtDate(j.created_at)}
                    </td>
                    <td className="px-5 py-2 font-mono text-xs">
                      {j.order_id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-2">
                      <StatusPill status={j.status} />
                    </td>
                    <td className="px-5 py-2 text-xs">
                      {j.smartbill_invoice_id ? (
                        <span className="font-mono text-zinc-700">
                          {j.smartbill_invoice_id}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-5 py-2 text-xs text-zinc-500">
                      {j.error_text ?? (j.status === 'SENT' ? 'OK' : `tentative ${j.attempts}`)}
                    </td>
                    <td className="px-5 py-2 text-right">
                      {j.status === 'FAILED' && canEdit && (
                        <button
                          type="button"
                          onClick={() => onRetry(j.id)}
                          disabled={pending && retryingId === j.id}
                          className="text-xs font-medium text-purple-700 hover:underline disabled:opacity-60"
                        >
                          {retryingId === j.id && pending ? 'Se reîncearcă…' : 'Reîncearcă'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
