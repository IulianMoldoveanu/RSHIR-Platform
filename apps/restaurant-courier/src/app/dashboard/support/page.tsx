import { LifeBuoy } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SupportChat } from './_chat';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Get the most recent ACTIVE conversation (BOT or OPERATOR_QUEUE/ACTIVE);
  // if none, the client component will create one on first send.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: conv } = await sb
    .from('support_conversations')
    .select('id, status, operator_message_count, topic')
    .eq('user_id', user.id)
    .in('status', ['BOT', 'OPERATOR_QUEUE', 'OPERATOR_ACTIVE'])
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let messages: Array<{
    id: string;
    sender: 'user' | 'bot' | 'operator';
    body: string;
    quick_replies: Array<{ label: string; value: string }> | null;
    created_at: string;
  }> = [];

  if (conv?.id) {
    const { data: msgs } = await sb
      .from('support_messages')
      .select('id, sender, body, quick_replies, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(200);
    messages = (msgs ?? []) as typeof messages;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/30 shadow-md shadow-violet-500/15">
          <LifeBuoy className="h-5 w-5 text-violet-300" aria-hidden strokeWidth={2.25} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-hir-fg">Suport</h1>
          <p className="mt-0.5 text-xs leading-relaxed text-hir-muted-fg">
            Răspuns sub 5 minute. Bot mai întâi, operator la nevoie, telefon ca ultim resort.
          </p>
        </div>
      </header>

      <SupportChat
        initialConversationId={conv?.id ?? null}
        initialStatus={(conv?.status ?? 'BOT') as
          | 'BOT'
          | 'OPERATOR_QUEUE'
          | 'OPERATOR_ACTIVE'}
        initialOperatorMsgCount={conv?.operator_message_count ?? 0}
        initialMessages={messages}
      />
    </div>
  );
}
