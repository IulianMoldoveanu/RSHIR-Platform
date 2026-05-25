// HIR Connect self-service lead capture from /connect page.
// Same-origin guard + per-IP rate limit (3/hour) + zod validation + Telegram
// forward to Hepi. Pattern mirrors /api/support/message.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  restaurantName: z.string().trim().min(2).max(200),
  contactEmail: z.string().trim().toLowerCase().email().max(254),
  contactPhone: z.string().trim().max(32).optional().or(z.literal('')),
  websiteUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//.test(u), 'URL trebuie să înceapă cu http(s)://'),
  estimatedOrdersPerDay: z.number().int().min(0).max(10000).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

const TG_PREVIEW_CHARS = 280;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function forwardToTelegram(args: {
  id: string;
  restaurantName: string;
  contactEmail: string;
  contactPhone: string | null;
  websiteUrl: string;
  estimatedOrdersPerDay: number | null;
  notes: string | null;
}): Promise<void> {
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_IULIAN_CHAT_ID;
  if (!bot || !chatId) {
    console.warn('[connect/lead] telegram env missing');
    return;
  }

  const lines = [
    `🔌 <b>HIR Connect — lead nou</b>`,
    `🏪 ${escapeHtml(args.restaurantName)}`,
    `🌐 ${escapeHtml(args.websiteUrl)}`,
    `📧 ${escapeHtml(args.contactEmail)}`,
  ];
  if (args.contactPhone) lines.push(`📞 ${escapeHtml(args.contactPhone)}`);
  if (args.estimatedOrdersPerDay !== null) {
    lines.push(`📦 ${args.estimatedOrdersPerDay} comenzi/zi estimate`);
  }
  if (args.notes) {
    const preview =
      args.notes.length > TG_PREVIEW_CHARS
        ? `${args.notes.slice(0, TG_PREVIEW_CHARS)}…`
        : args.notes;
    lines.push(`📝 ${escapeHtml(preview)}`);
  }
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
      console.error('[connect/lead] telegram failed', res.status, await res.text());
    }
  } catch (e) {
    console.error('[connect/lead] telegram threw', (e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const ip = clientIp(req);
  // 3 submissions / hour per IP — leads are higher-intent than support; tighter.
  const rl = checkLimit(`connect-lead:${ip}`, {
    capacity: 3,
    refillPerSec: 3 / 3600,
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
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const {
    restaurantName,
    contactEmail,
    contactPhone,
    websiteUrl,
    estimatedOrdersPerDay,
    notes,
  } = parsed.data;

  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;
  const storedIp = ip.startsWith('noip:') ? null : ip;

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: dbError } = await (admin as any)
    .from('connect_leads')
    .insert({
      restaurant_name: restaurantName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      website_url: websiteUrl,
      estimated_orders_per_day: estimatedOrdersPerDay ?? null,
      notes: notes || null,
      ip: storedIp,
      user_agent: userAgent,
      source: 'web_form',
    })
    .select('id')
    .single();

  if (dbError || !inserted?.id) {
    console.error('[connect/lead] insert failed', dbError?.message);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  await forwardToTelegram({
    id: inserted.id as string,
    restaurantName,
    contactEmail,
    contactPhone: contactPhone || null,
    websiteUrl,
    estimatedOrdersPerDay: estimatedOrdersPerDay ?? null,
    notes: notes || null,
  });

  return NextResponse.json({ ok: true, id: inserted.id });
}
