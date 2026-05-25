'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, User, AlertTriangle } from 'lucide-react';

type Msg = { role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'Cum câștig mai mult astăzi?',
  'Ce să fac dacă restaurantul întârzie cu comanda?',
  'Cum grupez 3 comenzi în aceeași zonă?',
  'Cum răspund unui client supărat?',
];

export function HepiCurierClient() {
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
      const res = await fetch('/api/courier/hepi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          history: messages,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.response) {
        setError(
          data?.error === 'ai_not_configured'
            ? 'Hepi Curier nu este încă activat pentru tine. Anunță echipa HIR.'
            : data?.error === 'unauthenticated'
              ? 'Sesiune expirată. Reîncărcă pagina.'
              : 'Hepi nu a putut răspunde. Încearcă din nou.',
        );
        return;
      }
      setMessages([
        ...nextHistory,
        { role: 'assistant', content: data.response as string },
      ]);
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
        className="flex max-h-[60vh] min-h-[280px] flex-col gap-3 overflow-y-auto rounded-lg border border-hir-border bg-hir-bg p-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-lg bg-gradient-to-br from-violet-50 to-fuchsia-50 p-3 text-sm text-zinc-800">
              <Sparkles className="mt-0.5 h-4 w-4 flex-none text-violet-600" aria-hidden />
              <span>
                Salut, sunt Hepi Curier. Te ajut cu rute, sfaturi pentru
                comenzi și câștiguri. Întreabă-mă orice — răspund pe scurt.
              </span>
            </div>
            <div className="grid gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  disabled={sending}
                  className="rounded-md border border-hir-border bg-white px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
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
              <div
                key={i}
                className={`flex items-start gap-2 ${
                  mine ? 'flex-row-reverse' : ''
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${
                    mine
                      ? 'bg-zinc-900 text-white'
                      : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
                  }`}
                >
                  {mine ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                </span>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    mine ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-hir-muted">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-violet-500" />
            Hepi se gândește…
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
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
          placeholder="Scrie-i lui Hepi…"
          className="flex-1 rounded-md border border-hir-border bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:bg-zinc-50"
        />
        <button
          type="button"
          onClick={() => void ask(input)}
          disabled={sending || !input.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
