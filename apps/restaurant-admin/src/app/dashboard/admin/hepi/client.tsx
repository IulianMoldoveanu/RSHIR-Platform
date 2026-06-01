'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, User, AlertTriangle } from 'lucide-react';

type Msg = { role: 'user' | 'assistant'; content: string; toolsUsed?: string[] };

const STARTERS = [
  'Care e pulsul rețelei acum?',
  'Ce orașe sunt active și unde sunt vendorii?',
  'Ce verificări (KYC/KYF) așteaptă aprobare?',
  'Arată-mi ultimele comenzi de farmacie.',
];

const TOOL_LABEL: Record<string, string> = {
  network_snapshot: 'puls rețea',
  orders_by_city: 'comenzi/oraș',
  list_recent_orders: 'comenzi recente',
  fleets_overview: 'flote',
  verifications_queue: 'verificări',
  explain_allocation: 'alocare',
};

export function HepiCommandCenterClient() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, sending]);

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
      setMessages([...nextHistory, { role: 'assistant', content: data.response as string, toolsUsed }]);
    } catch {
      setError('Conexiune întreruptă.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={listRef}
        className="flex max-h-[58vh] min-h-[320px] flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 text-sm text-slate-200">
              <Sparkles className="mt-0.5 h-4 w-4 flex-none text-violet-400" aria-hidden />
              <span>
                Salut, Iulian. Sunt Hepi — copilotul tău peste toată rețeaua de livrare. Întreabă-mă
                despre comenzi, flote, curieri, orașe sau verificări. Citesc datele live și îți explic.
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
                  {!mine && m.toolsUsed && m.toolsUsed.length > 0 ? (
                    <div className="flex flex-wrap gap-1 px-1 text-[10px] text-slate-500">
                      <span>citit:</span>
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
          placeholder="Întreabă-l pe Hepi despre rețea…"
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
