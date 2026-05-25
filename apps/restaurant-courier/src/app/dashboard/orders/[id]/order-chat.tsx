'use client';

// Wave 1.2 — Per-order mini-chat for the courier side. Identical pattern to
// the admin app's order-chat.tsx but writes from_role='COURIER'. RLS on
// public.order_messages restricts to the assigned courier of the parent
// courier_orders row.

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { Send } from 'lucide-react';

type Message = {
  id: string;
  from_role: 'TENANT' | 'COURIER' | 'SYSTEM';
  body: string;
  created_at: string;
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
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!courierOrderId) return;
    const supabase = getBrowserSupabase();
    let cancelled = false;

    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: e } = await (supabase as any)
        .from('order_messages')
        .select('id, from_role, body, created_at')
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
    });
    setSending(false);
    if (e) {
      setError(e.message);
      return;
    }
    setBody('');
  };

  return (
    <section className="rounded-md border border-hir-border bg-hir-bg p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-hir-fg">Mesaje cu restaurantul</h2>
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
                  {m.from_role === 'TENANT' ? 'restaurant' : mine ? 'tu' : 'sistem'}
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
      <div className="mt-3 flex gap-2">
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
          placeholder="Scrie restaurantului…"
          className="flex-1 rounded-md border border-hir-border bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:bg-zinc-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !body.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}
