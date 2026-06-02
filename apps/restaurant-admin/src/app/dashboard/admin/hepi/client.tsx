'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Send, Sparkles, User, AlertTriangle, Check, X, ShieldCheck, Zap } from 'lucide-react';
import type { HepiMode } from '@/lib/hepi/autonomy';
import { setHepiMode } from './actions';

type PendingAction = {
  token: string;
  actionId: string;
  label: string;
  describe: string;
  risk: 'low' | 'high';
};

type Msg = { role: 'user' | 'assistant'; content: string; toolsUsed?: string[]; pending?: PendingAction[] };

type ActionStatus = { status: 'running' | 'done' | 'error' | 'cancelled'; message?: string };

const STARTERS = [
  'Care e pulsul rețelei acum?',
  'Activează capitalele de județ.',
  'Ce verificări (KYC/KYF) așteaptă aprobare?',
  'Activează orașul Cluj-Napoca.',
];

const TOOL_LABEL: Record<string, string> = {
  network_snapshot: 'puls rețea',
  orders_by_city: 'comenzi/oraș',
  list_recent_orders: 'comenzi recente',
  fleets_overview: 'flote',
  verifications_queue: 'verificări',
  explain_allocation: 'alocare',
  activate_city: 'activare oraș',
  deactivate_city: 'dezactivare oraș',
  activate_county_capitals: 'activare capitale',
  set_tenant_status: 'status vendor',
  set_tenant_city: 'oraș vendor',
  assign_fleet: 'asignare flotă',
  mark_fleet_strike: 'strike flotă',
  verify_fleet_kyf: 'KYF flotă',
  create_partner: 'creare partener',
  generate_connect_invoices: 'facturi Connect',
  verify_courier_kyc: 'KYC curier',
  create_incident: 'creare incident',
  set_incident_status: 'status incident',
  promote_fleet_primary: 'promovare flotă',
  terminate_fleet_assignment: 'terminare asignare',
  grant_fleet_manager: 'rol fleet manager',
  onboard_vendor: 'onboard vendor',
  create_sibling_location: 'locație soră',
};

export function HepiCommandCenterClient({ initialMode }: { initialMode: HepiMode }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<HepiMode>(initialMode);
  const [actionState, setActionState] = useState<Record<string, ActionStatus>>({});
  const [savingMode, startSaveMode] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, sending]);

  const toggleMode = () => {
    const next: HepiMode = mode === 'confirm' ? 'direct' : 'confirm';
    if (
      next === 'direct' &&
      typeof window !== 'undefined' &&
      !window.confirm(
        'Treci Hepi pe ACȚIUNE DIRECTĂ? Va executa imediat ce-i ceri, fără să mai întrebe. Poți reveni oricând la „cere confirmare".',
      )
    ) {
      return;
    }
    startSaveMode(async () => {
      const res = await setHepiMode({ mode: next });
      if (res.ok) setMode(next);
      else setError(res.error);
    });
  };

  const confirmAction = async (a: PendingAction) => {
    setActionState((s) => ({ ...s, [a.token]: { status: 'running' } }));
    try {
      const res = await fetch('/api/admin/hepi/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: a.token }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) {
        setActionState((s) => ({ ...s, [a.token]: { status: 'error', message: d?.error ?? 'Eroare la execuție.' } }));
        return;
      }
      setActionState((s) => ({ ...s, [a.token]: { status: 'done', message: d.message as string } }));
    } catch {
      setActionState((s) => ({ ...s, [a.token]: { status: 'error', message: 'Conexiune întreruptă.' } }));
    }
  };

  const cancelAction = (a: PendingAction) => {
    setActionState((s) => ({ ...s, [a.token]: { status: 'cancelled' } }));
  };

  const ask = async (prompt: string) => {
    const text = prompt.trim();
    if (!text) return;
    setError(null);
    const nextHistory: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(nextHistory);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/admin/hepi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.response) {
        setError(
          data?.error === 'ai_not_configured'
            ? 'Hepi nu este încă configurat (lipsește cheia AI).'
            : data?.error === 'forbidden'
              ? 'Acces interzis — doar administratorul platformei.'
              : data?.error === 'unauthenticated'
                ? 'Sesiune expirată. Reîncarcă pagina.'
                : 'Hepi nu a putut răspunde. Încearcă din nou.',
        );
        return;
      }
      const toolsUsed = Array.isArray(data.tools_used) ? (data.tools_used as string[]) : undefined;
      const pending = Array.isArray(data.pending_actions) ? (data.pending_actions as PendingAction[]) : undefined;
      if (data.mode === 'confirm' || data.mode === 'direct') setMode(data.mode);
      setMessages([...nextHistory, { role: 'assistant', content: data.response as string, toolsUsed, pending }]);
    } catch {
      setError('Conexiune întreruptă.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Autonomy toggle */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {mode === 'direct' ? (
            <Zap className="h-3.5 w-3.5 text-amber-400" aria-hidden />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          )}
          <span>
            Mod:{' '}
            <span className={mode === 'direct' ? 'font-medium text-amber-300' : 'font-medium text-emerald-300'}>
              {mode === 'direct' ? 'acțiune directă' : 'cere confirmare'}
            </span>
            <span className="ml-1 text-slate-600">
              {mode === 'direct' ? '— execută imediat ce-i ceri' : '— propune, tu confirmi'}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={toggleMode}
          disabled={savingMode}
          className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-violet-500/50 hover:text-white disabled:opacity-50"
        >
          {savingMode ? '…' : mode === 'direct' ? 'Cere confirmare' : 'Acțiune directă'}
        </button>
      </div>

      <div
        ref={listRef}
        className="flex max-h-[58vh] min-h-[320px] flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 text-sm text-slate-200">
              <Sparkles className="mt-0.5 h-4 w-4 flex-none text-violet-400" aria-hidden />
              <span>
                Salut, Iulian. Sunt Hepi — orchestratorul tău peste toată rețeaua de livrare. Întreabă-mă
                sau cere-mi să acționez (activează un oraș, suspendă un vendor). Implicit întreb înainte.
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  disabled={sending}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.role === 'user';
            return (
              <div key={i} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <span
                  aria-hidden
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${
                    mine
                      ? 'bg-slate-700 text-white'
                      : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
                  }`}
                >
                  {mine ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                </span>
                <div className="flex max-w-[82%] flex-col gap-1">
                  <div
                    className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      mine ? 'bg-slate-700 text-white' : 'border border-slate-800 bg-slate-900 text-slate-100'
                    }`}
                  >
                    {m.content}
                  </div>

                  {/* Proposed actions awaiting confirmation */}
                  {!mine && m.pending && m.pending.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {m.pending.map((a) => {
                        const st = actionState[a.token];
                        return (
                          <div
                            key={a.token}
                            className={`rounded-xl border px-3 py-2 text-sm ${
                              a.risk === 'high'
                                ? 'border-amber-500/40 bg-amber-500/5'
                                : 'border-violet-500/30 bg-violet-500/5'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {a.risk === 'high' ? (
                                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-400" aria-hidden />
                              ) : (
                                <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-violet-400" aria-hidden />
                              )}
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  {a.label}
                                </span>
                                <span className="text-slate-200">{a.describe}</span>
                              </div>
                            </div>

                            {!st || st.status === 'running' ? (
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void confirmAction(a)}
                                  disabled={st?.status === 'running'}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                                >
                                  <Check className="h-3.5 w-3.5" aria-hidden />
                                  {st?.status === 'running' ? 'Se execută…' : 'Confirmă'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cancelAction(a)}
                                  disabled={st?.status === 'running'}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:text-white disabled:opacity-50"
                                >
                                  <X className="h-3.5 w-3.5" aria-hidden />
                                  Anulează
                                </button>
                              </div>
                            ) : (
                              <div
                                className={`mt-2 flex items-center gap-1 text-xs ${
                                  st.status === 'done'
                                    ? 'text-emerald-400'
                                    : st.status === 'error'
                                      ? 'text-rose-400'
                                      : 'text-slate-500'
                                }`}
                              >
                                {st.status === 'done' && <Check className="h-3.5 w-3.5" aria-hidden />}
                                {st.status === 'error' && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                                {st.status === 'done'
                                  ? (st.message ?? 'Executat.')
                                  : st.status === 'error'
                                    ? (st.message ?? 'Eroare.')
                                    : 'Anulat.'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {!mine && m.toolsUsed && m.toolsUsed.length > 0 ? (
                    <div className="flex flex-wrap gap-1 px-1 text-[10px] text-slate-500">
                      <span>folosit:</span>
                      {Array.from(new Set(m.toolsUsed)).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-violet-500/15 px-1.5 py-0.5 font-medium text-violet-300"
                        >
                          {TOOL_LABEL[t] ?? t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-violet-400" />
            Hepi se gândește…
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          disabled={sending}
          maxLength={4000}
          placeholder="Întreabă-l pe Hepi sau cere-i o acțiune…"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void ask(input)}
          disabled={sending || !input.trim()}
          className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
