// Lane U — In-app customer support chat panel intake.
//
// Anon-friendly POST endpoint: validated zod body, same-origin guard,
// rate-limited (5 messages / hour per IP), inserted via service-role.
// If a magic-link session exists in cookies, the verified user_id + email
// override what the client sent (defence-in-depth against spoofed emails).
// Telegram forwarding to Hepi is gated by env TELEGRAM_HEPI_FORWARD_SUPPORT,
// so it can be flipped on/off without redeploys.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATEGORIES = ['ORDER', 'PAYMENT', 'ACCOUNT', 'OTHER'] as const;

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  category: z.enum(CATEGORIES),
  message: z.string().trim().min(5).max(4000),
  tenantSlug: z.string().trim().min(1).max(100).optional(),
  // The public track token of the order being asked about. Holding it is what
  // proves the order is the sender's, so the order reference is resolved from
  // it server-side and never taken from the body.
  trackToken: z.string().uuid().optional(),
});

const TG_PREVIEW_CHARS = 280;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function forwardToTelegram(args: {
  id: string;
  email: string;
  category: string;
  message: string;
  tenantSlug: string | null;
  authedUser: boolean;
  restaurantOrderId?: string | null;
  courierOrderId?: string | null;
}): Promise<void> {
  if (process.env.TELEGRAM_HEPI_FORWARD_SUPPORT !== 'true') return;
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_IULIAN_CHAT_ID;
  if (!bot || !chatId) {
    console.warn('[support/message] telegram forward enabled but env missing');
    return;
  }

  const preview =
    args.message.length > TG_PREVIEW_CHARS
      ? `${args.message.slice(0, TG_PREVIEW_CHARS)}…`
      : args.message;

  const lines = [
    `💬 <b>Suport nou</b> — <code>${escapeHtml(args.category)}</code>`,
    `📧 ${escapeHtml(args.email)}${args.authedUser ? ' ✅' : ''}`,
  ];
  if (args.tenantSlug) lines.push(`🏪 ${escapeHtml(args.tenantSlug)}`);
  // Which order, so whoever reads this can act without asking the customer to
  // describe it. The delivery leg is called out separately because that is the
  // one a fleet manager owns.
  if (args.restaurantOrderId) {
    lines.push(`🧾 comanda <code>${escapeHtml(args.restaurantOrderId.slice(0, 8))}</code>`);
  }
  if (args.courierOrderId) {
    lines.push(`🛵 livrare <code>${escapeHtml(args.courierOrderId.slice(0, 8))}</code>`);
  }
  lines.push(`📝 ${escapeHtml(preview)}`);
  lines.push(`#${args.id.slice(0, 8)}`);

  try {
    const res = await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error('[support/message] telegram failed', res.status, await res.text());
    }
  } catch (e) {
    // Forward is best-effort. Never block the user response on Telegram errors.
    console.error('[support/message] telegram threw', (e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const ip = clientIp(req);
  // 5 messages / hour per IP
  const rl = checkLimit(`support-message:${ip}`, {
    capacity: 5,
    refillPerSec: 5 / 3600,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { category, message, tenantSlug, trackToken } = parsed.data;
  let { email } = parsed.data;

  // Defence-in-depth: if a session cookie is present, prefer the verified
  // identity over what the client typed.
  let authUserId: string | null = null;
  try {
    const sb = await getSupabase();
    const { data } = await sb.auth.getUser();
    if (data.user?.email) {
      email = data.user.email.toLowerCase();
      authUserId = data.user.id;
    }
  } catch {
    // If session lookup throws, fall back to the validated client-supplied email.
  }

  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;
  const storedIp = ip.startsWith('noip:') ? null : ip;

  // Resolve tenant slug -> id if provided
  const admin = getSupabaseAdmin();
  let tenantId: string | null = null;
  if (tenantSlug) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenantRow } = await (admin as any)
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .maybeSingle();
    if (tenantRow?.id) tenantId = tenantRow.id;
  }

  // Attach the order the customer is actually looking at. The token is the
  // proof of ownership, so the tenant comes from the order rather than from
  // the slug the client sent — a mismatched slug cannot misfile the report.
  let restaurantOrderId: string | null = null;
  let courierOrderId: string | null = null;
  if (trackToken) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orderRow } = await (admin as any)
      .from('restaurant_orders')
      .select('id, tenant_id')
      .eq('public_track_token', trackToken)
      .maybeSingle();
    if (orderRow?.id) {
      restaurantOrderId = orderRow.id;
      tenantId = orderRow.tenant_id ?? tenantId;
      // The delivery leg, when there is one. This is the handle a fleet
      // manager or dispatcher filters on.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: courierRow } = await (admin as any)
        .from('courier_orders')
        .select('id')
        .eq('source_order_id', String(orderRow.id))
        .maybeSingle();
      courierOrderId = courierRow?.id ?? null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: dbError } = await (admin as any)
    .from('support_messages')
    .insert({
      tenant_id: tenantId,
      auth_user_id: authUserId,
      email,
      category,
      message,
      ip: storedIp,
      user_agent: userAgent,
      restaurant_order_id: restaurantOrderId,
      courier_order_id: courierOrderId,
    })
    .select('id')
    .single();

  if (dbError || !inserted?.id) {
    console.error('[support/message] insert failed', dbError?.message);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  await forwardToTelegram({
    id: inserted.id as string,
    email,
    category,
    message,
    tenantSlug: tenantSlug ?? null,
    authedUser: authUserId !== null,
    restaurantOrderId,
    courierOrderId,
  });

  return NextResponse.json({ ok: true, id: inserted.id });
}
