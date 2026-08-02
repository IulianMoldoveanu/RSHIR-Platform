import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const restaurantSchema = z.object({
  kind: z.literal('restaurant'),
  email: z.string().trim().toLowerCase().email().max(254),
  restaurantName: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  // Accept empty string so the optional URL field doesn't fail zod url() check
  gloriaFoodUrl: z.union([z.string().trim().url().max(500), z.literal('')]).optional(),
  // 2026-08-02 — phone and message are their own fields now. /contact used to
  // pack both into `ref`, which is capped at 100 chars because it maps to
  // `ref_partner_code` (a partner code, not free text). Any real message blew
  // past the cap and the whole submission came back `invalid_body`, so the
  // contact form only ever accepted one-liners. See migration
  // 20260802_001_contact_lead_phone_message.sql.
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().max(2000).optional(),
  ref: z.string().trim().max(100).optional(),
});

const resellerSchema = z.object({
  kind: z.literal('reseller'),
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(200),
  country: z.string().trim().min(1).max(100),
  portfolioSize: z.coerce.number().int().min(0).max(100_000),
  ref: z.string().trim().max(100).optional(),
});

const bodySchema = z.discriminatedUnion('kind', [restaurantSchema, resellerSchema]);

const TG_PREVIEW_CHARS = 600;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Push the lead to Telegram. Nothing in this repo reads `migrate_leads` — no
 * admin queue, no cron, no digest — so before this the /contact form wrote to
 * a table nobody opens. A contact form whose messages are never seen is still
 * a broken contact form, even once it stops returning 400.
 *
 * Best-effort by design: the lead is already committed when this runs, so a
 * Telegram outage must never turn a saved message into an error for the
 * visitor. Mirrors /api/connect/lead and /api/support/message.
 */
async function forwardToTelegram(lines: string[]): Promise<void> {
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_IULIAN_CHAT_ID;
  if (!bot || !chatId) {
    console.warn('[migrate-leads] telegram env missing');
    return;
  }
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
      console.error('[migrate-leads] telegram failed', res.status, await res.text());
    }
  } catch (e) {
    console.error('[migrate-leads] telegram threw', (e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const ip = clientIp(req);
  // 5 requests / minute per IP
  const rl = checkLimit(`migrate-leads:${ip}`, {
    capacity: 5,
    refillPerSec: 5 / 60,
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

  const lead = parsed.data;

  const storedIp = ip.startsWith('noip:') ? null : ip;
  const row =
    lead.kind === 'restaurant'
      ? {
          kind: lead.kind,
          email: lead.email,
          name: lead.restaurantName,
          city: lead.city,
          gloriafood_url: lead.gloriaFoodUrl || null,
          phone: lead.phone || null,
          message: lead.message || null,
          ref_partner_code: lead.ref || null,
          ip: storedIp,
        }
      : {
          kind: lead.kind,
          email: lead.email,
          name: lead.name,
          country: lead.country,
          restaurants_count: lead.portfolioSize,
          ref_partner_code: lead.ref || null,
          ip: storedIp,
        };

  const admin = getSupabaseAdmin();
  const { error: dbError } = await (admin as unknown as {
    from: (t: string) => {
      insert: (r: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from('migrate_leads')
    .insert(row);

  if (dbError) {
    console.error('[migrate-leads] insert failed', dbError.message);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  const lines =
    lead.kind === 'restaurant'
      ? [
          // Three different pages post here — /contact, /demo and
          // /migrate-from-gloriafood — and Telegram is now the only place any
          // of them is read. A generic title plus a dropped gloriaFoodUrl left
          // a migration request indistinguishable from a contact message, and
          // its menu URL only recoverable by querying a table nobody opens.
          lead.gloriaFoodUrl
            ? '🔁 <b>Cerere migrare GloriaFood</b>'
            : '📨 <b>Mesaj nou de pe site</b>',
          `🏪 ${escapeHtml(lead.restaurantName)}`,
          `📧 ${escapeHtml(lead.email)}`,
          ...(lead.phone ? [`📞 ${escapeHtml(lead.phone)}`] : []),
          ...(lead.city ? [`📍 ${escapeHtml(lead.city)}`] : []),
          ...(lead.gloriaFoodUrl ? [`🔗 ${escapeHtml(lead.gloriaFoodUrl)}`] : []),
          ...(lead.ref ? [`🏷 ${escapeHtml(lead.ref)}`] : []),
          ...(lead.message
            ? [
                '',
                escapeHtml(
                  lead.message.length > TG_PREVIEW_CHARS
                    ? `${lead.message.slice(0, TG_PREVIEW_CHARS)}…`
                    : lead.message,
                ),
              ]
            : []),
        ]
      : [
          '🤝 <b>Lead revânzător nou</b>',
          `👤 ${escapeHtml(lead.name)}`,
          `📧 ${escapeHtml(lead.email)}`,
          `🌍 ${escapeHtml(lead.country)}`,
          `📦 ${lead.portfolioSize} în portofoliu`,
          ...(lead.ref ? [`🏷 ${escapeHtml(lead.ref)}`] : []),
        ];
  await forwardToTelegram(lines);

  return NextResponse.json({ ok: true });
}
