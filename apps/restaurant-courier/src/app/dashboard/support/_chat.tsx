'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { Send, Phone, CheckCircle2, Bot, User as UserIcon, Headphones } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { sendUserMessage, closeConversation } from './_actions';

type Message = {
  id: string;
  sender: 'user' | 'bot' | 'operator';
  body: string;
  quick_replies: Array<{ label: string; value: string }> | null;
  created_at: string;
};

type Status = 'BOT' | 'OPERATOR_QUEUE' | 'OPERATOR_ACTIVE' | 'RESOLVED' | 'ABANDONED';
type ActiveStatus = 'BOT' | 'OPERATOR_QUEUE' | 'OPERATOR_ACTIVE';

type Props = {
  initialConversationId: string | null;
  initialStatus: ActiveStatus;
  initialOperatorMsgCount: number;
  initialMessages: Message[];
};

// Full status map (including terminal states) so realtime UPDATE events
// don't crash the UI when a conversation closes (Codex P2).
const STATUS_LABEL: Record<Status, { label: string; tone: string }> = {
  BOT: { label: 'Bot asistent', tone: 'text-violet-300' },
  OPERATOR_QUEUE: { label: 'În așteptare operator…', tone: 'text-amber-300' },
  OPERATOR_ACTIVE: { label: 'Operator conectat', tone: 'text-emerald-300' },
  RESOLVED: { label: 'Conversație rezolvată', tone: 'text-emerald-400' },
  ABANDONED: { label: 'Conversație abandonată', tone: 'text-hir-muted-fg' },
};

export function SupportChat({
  initialConversationId,
  initialStatus,
  initialOperatorMsgCount,
  initialMessages,
}: Props) {
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [status, setStatus] = useState<Status>(initialStatus as Status);
  const [operatorMsgCount, setOperatorMsgCount] = useState(initialOperatorMsgCount);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to new operator messages on the active conversation.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = getBrowserSupabase();
    const channel = supabase
      .channel(`support:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as unknown as Message;
          // Skip duplicate (the user's own messages are already echoed locally).
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
          if (m.sender === 'operator') {
            setStatus('OPERATOR_ACTIVE');
            setOperatorMsgCount((c) => c + 1);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_conversations',
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          const c = payload.new as { status: Status; operator_message_count: number };
          if (c.status) setStatus(c.status);
          if (typeof c.operator_message_count === 'number') {
            setOperatorMsgCount(c.operator_message_count);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Autoscroll on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function submitText(text: string) {
    setError(null);
    setInput('');
    startTransition(async () => {
      const res = await sendUserMessage(conversationId, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConversationId(res.conversationId);
      // Fetched messages will land via realtime channel; no manual append.
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isPending) return;
    submitText(input);
  }

  const showCallButton = status === 'OPERATOR_ACTIVE' && operatorMsgCount >= 2;
  const supportPhone = process.env.NEXT_PUBLIC_HIR_SUPPORT_PHONE ?? '+40-xxx-xxx-xxx';

  return (
    <div className="flex flex-col gap-3">
      {/* Status pill — graceful fallback for terminal states (RESOLVED/ABANDONED)
          arriving via realtime so the UI doesn't crash on STATUS_LABEL[undefined]. */}
      {(() => {
        const meta = STATUS_LABEL[status] ?? STATUS_LABEL.BOT;
        return (
      <div className="flex items-center justify-between rounded-lg border border-hir-border bg-hir-surface px-3 py-2 text-xs">
        <span className={`flex items-center gap-1.5 font-medium ${meta.tone}`}>
          {status === 'BOT' ? <Bot className="h-3.5 w-3.5" aria-hidden /> : null}
          {status === 'OPERATOR_QUEUE' ? <Headphones className="h-3.5 w-3.5 animate-pulse" aria-hidden /> : null}
          {status === 'OPERATOR_ACTIVE' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : null}
          {meta.label}
        </span>
        {conversationId ? (
          <button
            type="button"
            onClick={async () => {
              const ok = confirm('Marchezi conversația ca rezolvată?');
              if (!ok) return;
              await closeConversation(conversationId);
              setMessages([]);
              setConversationId(null);
              setStatus('BOT');
              setOperatorMsgCount(0);
            }}
            className="text-[11px] font-medium text-hir-muted-fg underline-offset-2 hover:text-violet-300 hover:underline"
          >
            Închide
          </button>
        ) : null}
      </div>
        );
      })()}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex max-h-[60vh] min-h-[300px] flex-col gap-2 overflow-y-auto rounded-2xl border border-hir-border bg-hir-bg/40 p-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <Bot className="h-8 w-8 text-violet-400" aria-hidden />
            <p className="text-sm font-medium text-hir-fg">Cu ce te pot ajuta?</p>
            <p className="max-w-xs text-xs text-hir-muted-fg">
              Scrie problema sau apasă unul din butoane.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {[
                { label: 'Problemă livrare', value: 'Am o problemă la livrare' },
                { label: 'Plată întârziată', value: 'Nu am primit plata' },
                { label: 'Adresă greșită', value: 'Adresa clientului e greșită' },
                { label: 'Operator', value: 'Vreau să vorbesc cu un operator' },
              ].map((q) => (
                <button
                  key={q.value}
                  type="button"
                  disabled={isPending}
                  onClick={() => submitText(q.value)}
                  className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[11px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <ChatBubble key={m.id} message={m} onQuickReply={submitText} isPending={isPending} />)
        )}
      </div>

      {/* Call button (escalation last resort) */}
      {showCallButton ? (
        <a
          href={`tel:${supportPhone}`}
          className="flex items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-rose-500/30 hover:bg-rose-400"
        >
          <Phone className="h-4 w-4" aria-hidden />
          Sună operatorul HIR
        </a>
      ) : null}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isPending}
          placeholder="Scrie un mesaj…"
          aria-label="Mesaj suport"
          maxLength={2000}
          className="flex-1 rounded-lg border border-hir-border bg-hir-surface px-3 py-2.5 text-sm text-hir-fg outline-none placeholder:text-hir-muted-fg focus:border-violet-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          aria-label="Trimite"
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-violet-500 text-white shadow-md shadow-violet-500/30 hover:bg-violet-400 disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>

      {error ? (
        <p className="text-center text-xs text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}

function ChatBubble({
  message,
  onQuickReply,
  isPending,
}: {
  message: Message;
  onQuickReply: (text: string) => void;
  isPending: boolean;
}) {
  const isUser = message.sender === 'user';
  const isOperator = message.sender === 'operator';

  return (
    <div className={`flex items-end gap-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser ? (
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            isOperator ? 'bg-emerald-500/20 text-emerald-200' : 'bg-violet-500/20 text-violet-200'
          }`}
          aria-hidden
        >
          {isOperator ? <Headphones className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
        </span>
      ) : null}
      <div className={`flex max-w-[80%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
            isUser
              ? 'rounded-br-md bg-violet-500 text-white'
              : isOperator
                ? 'rounded-bl-md bg-emerald-500/15 text-emerald-100 ring-1 ring-inset ring-emerald-500/30'
                : 'rounded-bl-md bg-hir-surface text-hir-fg ring-1 ring-inset ring-hir-border'
          }`}
        >
          {message.body}
        </div>
        {message.quick_replies && message.quick_replies.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {message.quick_replies.map((qr) => (
              <button
                key={qr.value}
                type="button"
                disabled={isPending}
                onClick={() => onQuickReply(qr.value)}
                className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
              >
                {qr.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {isUser ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/30 text-[10px] text-violet-100" aria-hidden>
          <UserIcon className="h-3 w-3" />
        </span>
      ) : null}
    </div>
  );
}
