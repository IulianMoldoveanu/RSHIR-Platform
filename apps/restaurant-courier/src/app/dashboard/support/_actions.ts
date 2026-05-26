'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { classify, type BotResponse } from '@/lib/support/bot-rules';

type SendResult =
  | { ok: true; conversationId: string; status: string; showCallButton: boolean }
  | { ok: false; error: string };

/**
 * sendUserMessage — append the user's message to the conversation, run the
 * bot rules engine, append the bot reply, and escalate if needed. Creates a
 * conversation on first call.
 *
 * Operator side: messages from operator_user_id come in via a separate path
 * (Telegram → Edge Function → INSERT support_messages with sender='operator'),
 * out of scope for this action.
 */
export async function sendUserMessage(
  conversationId: string | null,
  body: string,
): Promise<SendResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Mesaj gol' };
  if (trimmed.length > 2000) return { ok: false, error: 'Mesaj prea lung (max 2000)' };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // ── 1. Resolve / create conversation.
  let convId = conversationId;
  let convStatus = 'BOT' as
    | 'BOT'
    | 'OPERATOR_QUEUE'
    | 'OPERATOR_ACTIVE'
    | 'RESOLVED'
    | 'ABANDONED';

  if (!convId) {
    const { data: created, error: createErr } = await sb
      .from('support_conversations')
      .insert({
        user_id: user.id,
        user_role: 'courier',
        status: 'BOT',
      })
      .select('id, status')
      .single();
    if (createErr) return { ok: false, error: createErr.message };
    convId = created.id as string;
    convStatus = created.status as typeof convStatus;
  } else {
    const { data: existing } = await sb
      .from('support_conversations')
      .select('status')
      .eq('id', convId)
      .maybeSingle();
    if (existing?.status) convStatus = existing.status as typeof convStatus;
  }

  // ── 2. Append user message.
  const { error: userMsgErr } = await sb.from('support_messages').insert({
    conversation_id: convId,
    sender: 'user',
    body: trimmed,
  });
  if (userMsgErr) return { ok: false, error: userMsgErr.message };

  // ── 3. Bot reply — only when still in BOT mode. Once escalated to operator,
  // the bot stays silent so operator and user can chat directly.
  let showCallButton = false;

  if (convStatus === 'BOT') {
    const reply: BotResponse = classify(trimmed);

    const { error: botErr } = await sb.from('support_messages').insert({
      conversation_id: convId,
      sender: 'bot',
      body: reply.body,
      bot_intent: reply.intent,
      quick_replies: reply.quick_replies.length > 0 ? reply.quick_replies : null,
    });
    if (botErr) return { ok: false, error: botErr.message };

    if (reply.escalate) {
      const { error: escErr } = await sb
        .from('support_conversations')
        .update({
          status: 'OPERATOR_QUEUE',
          topic: reply.topic,
        })
        .eq('id', convId);
      if (escErr) return { ok: false, error: escErr.message };
      convStatus = 'OPERATOR_QUEUE';
      // Operator picks up async. Fan-out to Telegram is done by a separate
      // Edge Function listening to status changes (deployed separately).
    } else if (reply.topic) {
      // Track topic for analytics even when not escalating.
      await sb.from('support_conversations').update({ topic: reply.topic }).eq('id', convId);
    }
  }

  // ── 4. Decide if CALL button should be visible.
  // Show the button only after at least 2 operator-side replies AND the
  // conversation is still OPERATOR_ACTIVE (i.e. user wasn't satisfied yet).
  // Per Iulian: "putem adauga buton de call doar dupa ce vedem ca lucrurile
  // chiar nu se rezolva dintr un simplu mesaj".
  const { data: opCount } = await sb
    .from('support_conversations')
    .select('operator_message_count, status')
    .eq('id', convId)
    .maybeSingle();
  if (
    opCount &&
    opCount.status === 'OPERATOR_ACTIVE' &&
    (opCount.operator_message_count ?? 0) >= 2
  ) {
    showCallButton = true;
  }

  revalidatePath('/dashboard/support');
  return { ok: true, conversationId: convId, status: convStatus, showCallButton };
}

export async function closeConversation(conversationId: string): Promise<{ ok: boolean }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  await sb
    .from('support_conversations')
    .update({ status: 'RESOLVED', resolved_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', user.id);

  revalidatePath('/dashboard/support');
  return { ok: true };
}
