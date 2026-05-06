'use client';

// Lane HEPY-PRB — client wrapper for the OWNER Hepy binding page.
//
// Only handles two actions:
//   - generate connect link (mints nonce, opens t.me/<bot>?start=connect_<>)
//   - unbind (terminates active binding)
//
// The page server component does all data fetching + auth gating; this
// client only owns the user-interaction state.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, ExternalLink, Loader2, Send, Unplug } from 'lucide-react';
import { generateConnectLink, unbindTelegram, type HepyConnectResult, type HepyUnbindResult } from './actions';

type ActiveBinding = {
  id: string;
  telegram_username: string | null;
  bound_at_label: string;
  last_active_label: string | null;
};

type ConnectState =
  | { kind: 'idle' }
  | { kind: 'ready'; url: string; expires_at: number };

const CONNECT_ERR_RO: Record<Exclude<Extract<HepyConnectResult, { ok: false }>['error'], 'unauthenticated'>, string> = {
  forbidden_owner_only: 'Doar proprietarul restaurantului poate conecta Telegram.',
  forbidden_tenant_mismatch: 'Restaurantul activ s-a schimbat. Reîncărcați pagina.',
  rate_limited: 'Prea multe link-uri generate astăzi. Încercați mâine.',
  db_error: 'A apărut o eroare temporară. Reîncercați.',
};

const UNBIND_ERR_RO: Record<Exclude<Extract<HepyUnbindResult, { ok: false }>['error'], 'unauthenticated'>, string> = {
  forbidden_owner_only: 'Doar proprietarul restaurantului poate deconecta.',
  forbidden_tenant_mismatch: 'Restaurantul activ s-a schimbat. Reîncărcați pagina.',
  not_bound: 'Nicio conectare activă.',
  db_error: 'A apărut o eroare temporară. Reîncercați.',
};

export function HepyConnectClient({
  tenantId,
  tenantName,
  binding,
}: {
  tenantId: string;
  tenantName: string;
  binding: ActiveBinding | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [connect, setConnect] = useState<ConnectState>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    setError(null);
    start(async () => {
      const r = await generateConnectLink({ expectedTenantId: tenantId });
      if (!r.ok) {
        if (r.error === 'unauthenticated') {
          setError('Sesiunea a expirat. Reîncărcați pagina.');
          return;
        }
        setError(CONNECT_ERR_RO[r.error] ?? 'Eroare necunoscută.');
        return;
      }
      setConnect({
        kind: 'ready',
        url: r.url,
        expires_at: Date.now() + r.expires_in_seconds * 1000,
      });
    });
  }

  function handleUnbind() {
    if (!binding) return;
    if (!confirm(`Sigur deconectați Telegram pentru ${tenantName}? Veți putea reconecta oricând.`)) return;
    setError(null);
    start(async () => {
      const r = await unbindTelegram({ bindingId: binding.id, expectedTenantId: tenantId });
      if (!r.ok) {
        if (r.error === 'unauthenticated') {
          setError('Sesiunea a expirat. Reîncărcați pagina.');
          return;
        }
        setError(UNBIND_ERR_RO[r.error] ?? 'Eroare necunoscută.');
        return;
      }
      setConnect({ kind: 'idle' });
      router.refresh();
    });
  }

  function handleCopy() {
    if (connect.kind !== 'ready') return;
    void navigator.clipboard.writeText(connect.url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setError('Copierea a eșuat. Selectați manual.'),
    );
  }

  // Bound state ────────────────────────────────────────────────
  if (binding) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
              <Send className="h-3 w-3" aria-hidden /> Conectat
            </span>
            <p className="text-sm font-semibold text-emerald-900">
              {binding.telegram_username ? `@${binding.telegram_username}` : 'Cont Telegram conectat'}
            </p>
            <p className="text-xs text-emerald-800">
              Conectat la {tenantName} din {binding.bound_at_label}
              {binding.last_active_label ? ` · ultima activitate ${binding.last_active_label}` : ''}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleUnbind}
            disabled={pending}
            className="inline-flex items-center gap-1.5 self-start rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Unplug className="h-3.5 w-3.5" aria-hidden />}
            Deconectează
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>
        )}
      </section>
    );
  }

  // Unbound state ──────────────────────────────────────────────
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-100">
            <Send className="h-4 w-4" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-zinc-900">Conectează Telegram</h2>
            <p className="text-xs text-zinc-600">
              Generăm un link unic, valid 1 oră. Deschideți-l pe telefonul cu Telegram instalat și apăsați <b>Start</b>.
            </p>
          </div>
        </div>

        {connect.kind === 'idle' && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            className="inline-flex w-fit items-center gap-1.5 rounded-md bg-purple-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Generează link
          </button>
        )}

        {connect.kind === 'ready' && (
          <div className="flex flex-col gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3">
            <p className="text-xs text-purple-900">
              Linkul este gata. Apăsați-l de pe telefon pentru a deschide chat-ul cu Hepy.
            </p>
            <code className="break-all rounded-md bg-white px-2 py-1.5 text-xs text-zinc-800 ring-1 ring-inset ring-zinc-200">
              {connect.url}
            </code>
            <div className="flex flex-wrap gap-2">
              <a
                href={connect.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-purple-700"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Deschide în Telegram
              </a>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                {copied ? 'Copiat ✓' : 'Copiază link'}
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Generează altul
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-700">{error}</p>
        )}
      </div>
    </section>
  );
}
