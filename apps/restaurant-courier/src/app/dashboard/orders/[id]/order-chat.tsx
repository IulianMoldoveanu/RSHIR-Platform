'use client';

// Wave 6 — Per-order chat with explicit channel split. The courier sees BOTH
// the tenant↔courier thread AND the client↔courier thread in one feed, with
// a visible "Către: Restaurant / Client" toggle that decides which channel
// the courier's reply lands on.
//
// Defaults: if the last incoming (not-self, not-broadcast) message was from
// the client, reply target stays "Client". Otherwise "Restaurant". This
// matches the dominant inbound→reply pattern with zero extra taps.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { Send, Store, User } from 'lucide-react';

type Channel = 'TENANT_COURIER' | 'CLIENT_COURIER' | 'BROADCAST';

type Message = {
  id: string;
  from_role: 'TENANT' | 'COURIER' | 'SYSTEM' | 'CLIENT';
  body: string;
  created_at: string;
  channel: Channel;
};

export function OrderChat({
  courierOrderId,
  currentUserId,
}: {
  courierOrderId: string;
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<'TENANT_COURIER' | 'CLIENT_COURIER'>('TENANT_COURIER');
  const userTouchedTargetRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!courierOrderId) return;
    const supabase = getBrowserSupabase();
    let cancelled = false;

    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any)
        .from('order_messages')
        .select('id, from_role, body, created_at, channel')
        .eq('courier_order_id', courierOrderId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (cancelled) return;
      if (e) setError(e.message);
      else setMessages((data ?? []) as Message[]);
    })();

    const channel: RealtimeChannel = supabase
      .channel(`order:${courierOrderId}:chat`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_messages',
          filter: `courier_order_id=eq.${courierOrderId}`,
        },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) =>
            prev.find((m) => m.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [courierOrderId]);

  // Auto-shift reply target to match the latest inbound channel — unless the
  // courier explicitly toggled it themselves (then we respect their choice).
  useEffect(() => {
    if (userTouchedTargetRef.current) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.from_role === 'COURIER' || m.from_role === 'SYSTEM') continue;
      if (m.channel === 'TENANT_COURIER' || m.channel === 'CLIENT_COURIER') {
        setTarget(m.channel);
        return;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    const supabase = getBrowserSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any).from('order_messages').insert({
      courier_order_id: courierOrderId,
      from_role: 'COURIER',
      from_user_id: currentUserId,
      body: trimmed,
      channel: target,
    });
    setSending(false);
    if (e) {
      setError(e.message);
      return;
    }
    setBody('');
  };

  const unreadFromClient = useMemo(
    () =>
      messages.some(
        (m) => m.from_role === 'CLIENT' && m.channel === 'CLIENT_COURIER',
      ),
    [messages],
  );

  return (
    <section className="rounded-md border border-hir-border bg-hir-bg p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-hir-fg">Mesaje comandă</h2>
        <span className="text-[10px] uppercase tracking-wider text-hir-muted">live</span>
      </div>
      <div
        ref={listRef}
        className="mt-3 flex max-h-72 min-h-[120px] flex-col gap-2 overflow-y-auto rounded-md bg-black/5 p-3 text-sm"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-hir-muted">Niciun mesaj încă.</p>
        ) : (
          messages.map((m) => {
            const mine = m.from_role === 'COURIER';
            const isSystem = m.from_role === 'SYSTEM';
            const fromClient = m.from_role === 'CLIENT';
            return (
              <div
                key={m.id}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${
                    isSystem
                      ? 'bg-amber-50 text-amber-900'
                      : mine
                        ? 'bg-violet-600 text-white'
                        : fromClient
                          ? 'bg-emerald-50 text-emerald-900'
                          : 'bg-white text-zinc-900'
                  }`}
                >
                  {m.body}
                </div>
                <span className="mt-0.5 text-[10px] text-hir-muted">
                  {new Date(m.created_at).toLocaleTimeString('ro-RO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {labelFor(m)}
                </span>
              </div>
            );
          })
        )}
      </div>
      {error && (
        <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Reply target toggle */}
      <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Către">
        <button
          type="button"
          role="radio"
          aria-checked={target === 'TENANT_COURIER'}
          onClick={() => {
            userTouchedTargetRef.current = true;
            setTarget('TENANT_COURIER');
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            target === 'TENANT_COURIER'
              ? 'bg-violet-600 text-white'
              : 'bg-white text-hir-fg ring-1 ring-inset ring-hir-border hover:bg-zinc-50'
          }`}
        >
          <Store className="h-3.5 w-3.5" aria-hidden />
          Restaurant
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={target === 'CLIENT_COURIER'}
          onClick={() => {
            userTouchedTargetRef.current = true;
            setTarget('CLIENT_COURIER');
          }}
          className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            target === 'CLIENT_COURIER'
              ? 'bg-emerald-600 text-white'
              : 'bg-white text-hir-fg ring-1 ring-inset ring-hir-border hover:bg-zinc-50'
          }`}
        >
          <User className="h-3.5 w-3.5" aria-hidden />
          Client
          {unreadFromClient && target !== 'CLIENT_COURIER' && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500"
            />
          )}
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          maxLength={2000}
          disabled={sending}
          placeholder={target === 'CLIENT_COURIER' ? 'Scrie clientului…' : 'Scrie restaurantului…'}
          className="flex-1 rounded-md border border-hir-border bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:bg-zinc-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !body.trim()}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            target === 'CLIENT_COURIER'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-violet-600 hover:bg-violet-700'
          }`}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

function labelFor(m: Message): string {
  if (m.from_role === 'COURIER') return 'tu';
  if (m.from_role === 'SYSTEM') return 'sistem';
  if (m.from_role === 'CLIENT') return 'client';
  return 'restaurant';
}
