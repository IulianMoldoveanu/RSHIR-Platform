// Lane EMAIL-REPLY (2026-05-05) — admin replies to a support_messages row
// and emails the customer back via Resend, recording the thread in
// public.support_replies.
//
// POST /api/admin/support/reply
// Body: { messageId: uuid, replyText: string }
// Auth: platform_admin only (HIR_PLATFORM_ADMIN_EMAILS allow-list).
//
// Effect:
//   1. Loads the support_messages row + tenant brand (name only — settings
//      may carry a brand_color but isn't typed here, so HIR shell is used).
//   2. Inserts support_replies row with delivery_status='PENDING'.
//   3. Sends email via Resend with subject "Răspuns la mesajul dumneavoastră
//      către HIR Support". Reply-To = HIR_SUPPORT_REPLY_TO (default
//      support@hir.ro).
//   4. Updates support_replies.delivery_status to SENT/FAILED/SKIPPED.
//   5. Updates support_messages.status='RESPONDED' on success (operator can
//      still mark RESOLVED later).
//
// Returns: { ok, replyId, deliveryStatus, deliveryError? }
//
// Idempotency: not enforced — operator-driven, infrequent, low cost. If the
// same reply is double-clicked, a duplicate row is created (visible in the
// thread). Acceptable trade-off for a manual support workflow.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { supportReplyEmail } from '@/lib/email/support-reply';
import { HIR_PLATFORM_BRAND, type EmailBrand } from '@/lib/email/layout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  messageId: z.string().uuid(),
  replyText: z.string().min(2).max(8000),
});

const CATEGORY_LABELS: Record<string, string> = {
  ORDER: 'Comandă',
  PAYMENT: 'Plată',
  ACCOUNT: 'Cont',
  OTHER: 'Altceva',
};

type AuthOk = { ok: true; userId: string; email: string };
type AuthErr = { ok: false; status: number };

async function isPlatformAdmin(): Promise<AuthOk | AuthErr> {
  const supa = createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) return { ok: false, status: 401 };
  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.includes(user.email.toLowerCase())) return { ok: false, status: 403 };
  return { ok: true, userId: user.id, email: user.email };
}

export async function POST(req: NextRequest) {
  const auth = await isPlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'unauthorized' : 'forbidden' },
      { status: auth.status },
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { messageId, replyText } = parsed.data;
  const admin = createAdminClient();

  // 1. Load the support message + tenant brand context.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: msg, error: msgErr } = await (admin as any)
    .from('support_messages')
    .select('id, email, message, category, tenant_id, created_at, status')
    .eq('id', messageId)
    .maybeSingle();

  if (msgErr) {
    return NextResponse.json({ error: 'load_failed', detail: msgErr.message }, { status: 500 });
  }
  if (!msg) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!msg.email) {
    return NextResponse.json(
      { error: 'no_customer_email', detail: 'Mesajul nu are adresă de email a clientului.' },
      { status: 422 },
    );
  }

  let brand: EmailBrand = HIR_PLATFORM_BRAND;
  if (msg.tenant_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenant } = await (admin as any)
      .from('tenants')
      .select('name')
      .eq('id', msg.tenant_id)
      .maybeSingle();
    if (tenant?.name) {
      brand = { name: `HIR · ${tenant.name}`, logoUrl: null, brandColor: HIR_PLATFORM_BRAND.brandColor };
    }
  }

  // 2. Insert the reply row in PENDING state so we have an id even if email fails.
  const { subject, html, text } = supportReplyEmail({
    customerEmail: msg.email,
    replyText,
    originalMessage: msg.message,
    originalReceivedAtIso: msg.created_at,
    brand,
    categoryLabel: msg.category ? CATEGORY_LABELS[msg.category] ?? msg.category : null,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertRes = await (admin as any)
    .from('support_replies')
    .insert({
      message_id: messageId,
      reply_text: replyText,
      reply_html: html,
      sent_by: auth.userId,
      delivery_status: 'PENDING',
    })
    .select('id')
    .single();

  if (insertRes.error || !insertRes.data) {
    return NextResponse.json(
      { error: 'reply_insert_failed', detail: insertRes.error?.message },
      { status: 500 },
    );
  }
  const replyId = insertRes.data.id as string;

  // 3. Send the email.
  const replyTo = process.env.HIR_SUPPORT_REPLY_TO || 'support@hir.ro';
  const sendRes = await sendEmail({
    to: msg.email,
    subject,
    html,
    text,
    replyTo,
  });

  // 4. Update the reply row with the delivery outcome.
  let deliveryStatus: 'SENT' | 'FAILED' | 'SKIPPED';
  let deliveryError: string | null = null;
  let resendId: string | null = null;

  if (sendRes.ok) {
    deliveryStatus = 'SENT';
    resendId = sendRes.id ?? null;
  } else if (sendRes.reason === 'not_configured') {
    // Resend not provisioned in this environment — record so operator knows.
    deliveryStatus = 'SKIPPED';
    deliveryError = 'RESEND_API_KEY not configured — email not sent. Reply recorded only.';
  } else {
    deliveryStatus = 'FAILED';
    deliveryError = sendRes.detail ?? 'Resend request failed.';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('support_replies')
    .update({
      delivery_status: deliveryStatus,
      delivery_error: deliveryError,
      resend_id: resendId,
    })
    .eq('id', replyId);

  // 5. Mark the message as RESPONDED on successful (or skipped) send.
  if (deliveryStatus !== 'FAILED') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('support_messages')
      .update({ status: 'RESPONDED' })
      .eq('id', messageId);
  }

  return NextResponse.json({
    ok: deliveryStatus !== 'FAILED',
    replyId,
    deliveryStatus,
    ...(deliveryError ? { deliveryError } : {}),
  });
}

// GET /api/admin/support/reply?messageId=uuid
// Returns the reply thread for a given message, newest last (chronological).
export async function GET(req: NextRequest) {
  const auth = await isPlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'unauthorized' : 'forbidden' },
      { status: auth.status },
    );
  }
  const messageId = req.nextUrl.searchParams.get('messageId');
  const idCheck = z.string().uuid().safeParse(messageId);
  if (!idCheck.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('support_replies')
    .select('id, reply_text, sent_at, sent_by, delivery_status, delivery_error')
    .eq('message_id', idCheck.data)
    .order('sent_at', { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'load_failed', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, replies: data ?? [] });
}
