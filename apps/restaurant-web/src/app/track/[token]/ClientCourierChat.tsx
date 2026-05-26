'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';

type Msg = {
  id: string;
  from_role: 'CLIENT' | 'COURIER' | 'SYSTEM';
  body: string;
  created_at: string;
};

const STARTER_PRESETS = [
  'Sunt la poartă, te aștept.',
  'Sună la interfon, te rog.',
  'Mai stau ~5 minute, vin imediat.',
];

export function ClientCourierChat({
  ctoken,
  courierFirstName,
  orderClosed,
}: {
  ctoken: string;
  courierFirstName: string | null;
  orderClosed: boolean;
}) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Polling-based sync. We cannot use Supabase Realtime postgres_changes for
  // anon visitors because the RLS SELECT policy on order_messages requires
  // tenant membership or being the assigned courier — anon sees nothing.
  // The HIR Connect path inherits the same constraint, so polling is the
  // shared mechanism. Cadence chosen for "feels live" without hammering the
  // server: 4s when active, paused when tab is hidden.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/courier-track/${ctoken}/messages`, { cache: 'no-store' });
        if (res.ok) {
          const j = await res.json();
          if (!cancelled) setMsgs(j.messages ?? []);
        }
      } catch {
        // swallow
      } finally {
        if (!cancelled) {
          const delay = typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 30_000 : 4_000;
          timer = setTimeout(load, delay);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ctoken]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs?.length]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || orderClosed) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/courier-track/${ctoken}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        if (res.status === 429) setError('Mai așteaptă câteva secunde înainte să trimiți din nou.');
        else if (res.status === 400) setError('Mesajul este invalid.');
        else if (res.status === 404) setError('Comanda nu mai este activă.');
        else setError('Nu am putut trimite. Încearcă din nou.');
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { id?: string };
      // Optimistic append — the next poll will reconcile.
      setMsgs((prev) => [
        ...(prev ?? []),
        {
          id: j.id ?? `local-${Date.now()}`,
          from_role: 'CLIENT',
          body: trimmed,
          created_at: new Date().toISOString(),
        },
      ]);
      setBody('');
    } catch {
      setError('Eroare de rețea.');
    } finally {
      setSending(false);
    }
  }

  if (orderClosed && (msgs?.length ?? 0) === 0) return null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="flex items-center gap-2.5 border-b border-zinc-200 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <MessageCircle className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">
            {courierFirstName ? `Scrie-i ${courierFirstName}` : 'Scrie curierului'}
          </p>
          <p className="text-[11px] text-zinc-500">
            Mesajele sunt văzute doar de curier.
          </p>
        </div>
      </header>

      <div className="max-h-80 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
        {msgs === null ? (
          <p className="text-center text-xs text-zinc-400">Se încarcă…</p>
        ) : msgs.length === 0 ? (
          <p className="text-center text-xs text-zinc-400">
            Niciun mesaj încă. Spune-i unde te poate găsi mai ușor.
          </p>
        ) : (
          msgs.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        <div ref={endRef} />
      </div>

      {!orderClosed && (msgs?.length ?? 0) === 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-4 py-2">
          {STARTER_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => send(p)}
              disabled={sending}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {!orderClosed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(body);
          }}
          className="flex gap-2 border-t border-zinc-200 px-3 py-2"
        >
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            placeholder="Scrie un mesaj…"
            className="h-10 flex-1 rounded-md border border-zinc-300 px-3 text-sm focus:border-purple-500 focus:outline-none"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="flex h-10 items-center justify-center gap-1 rounded-md bg-purple-700 px-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden />
            <span className="sr-only">Trimite</span>
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const fromClient = msg.from_role === 'CLIENT';
  const fromSystem = msg.from_role === 'SYSTEM';
  if (fromSystem) {
    return (
      <p className="text-center text-[11px] uppercase tracking-wider text-zinc-400">{msg.body}</p>
    );
  }
  return (
    <div className={`flex ${fromClient ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
          fromClient
            ? 'rounded-br-sm bg-purple-600 text-white'
            : 'rounded-bl-sm bg-zinc-100 text-zinc-900'
        }`}
      >
        <p className="whitespace-pre-wrap">{msg.body}</p>
        <p className={`mt-0.5 text-[10px] ${fromClient ? 'text-purple-100/80' : 'text-zinc-400'}`}>
          {new Date(msg.created_at).toLocaleTimeString('ro-RO', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
