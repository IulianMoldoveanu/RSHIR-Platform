// Lead capture for the /pricing#calculator interactive ROI widget.
// Pattern matches /api/connect/lead: same-origin guard + rate limit +
// Zod validation + Supabase insert + Telegram notification to Iulian.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// RO phone: 07XXXXXXXX or +407XXXXXXXX — sanity check, not strict.
const RO_PHONE_RE = /^(\+40|0)(7\d{8}|[2-9]\d{7,8})$/;

const bodySchema = z.object({
  phone: z
    .string()
    .trim()
    .min(10)
    .max(20)
    .refine((v) => RO_PHONE_RE.test(v.replace(/\s+/g, '')), {
      message: 'Număr de telefon invalid. Exemplu: 0712345678',
    }),
  restaurantName: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  comenziPerZi: z.number().int().min(5).max(500),
  aovLei: z.number().int().min(20).max(200),
  estimatedSavingsMonthlyLei: z.number().int().min(0),
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyTelegram(args: {
  id: string;
  phone: string;
  restaurantName: string | null;
  city: string | null;
  comenziPerZi: number;
  aovLei: number;
  estimatedSavingsMonthlyLei: number;
}): Promise<void> {
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_IULIAN_CHAT_ID;
  if (!bot || !chatId) {
    console.warn('[calculator-leads] telegram env missing');
    return;
  }

  const savings = new Intl.NumberFormat('ro-RO').format(
    args.estimatedSavingsMonthlyLei,
  );
  const lines = [
    `📊 <b>Lead calculator ROI — nou</b>`,
    `📞 ${escapeHtml(args.phone)}`,
    args.restaurantName ? `🏪 ${escapeHtml(args.restaurantName)}` : null,
    args.city ? `📍 ${escapeHtml(args.city)}` : null,
    `📦 ${args.comenziPerZi} comenzi/zi × ${args.aovLei} lei AOV`,
    `💰 Economie estimată: <b>${savings} lei/lună</b>`,
    `#calc_lead #${args.id.slice(0, 8)}`,
  ].filter(Boolean);

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${bot}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join('\n'),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      },
    );
    if (!res.ok) {
      console.error(
        '[calculator-leads] telegram failed',
        res.status,
        await res.text(),
      );
    }
  } catch (e) {
    console.error('[calculator-leads] telegram threw', (e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const ip = clientIp(req);
  // 3 lead submissions per hour per IP
  const rl = checkLimit(`calculator-leads:${ip}`, {
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
    phone,
    restaurantName,
    city,
    comenziPerZi,
    aovLei,
    estimatedSavingsMonthlyLei,
  } = parsed.data;

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: dbError } = await (admin as any)
    .from('marketing_calculator_leads')
    .insert({
      phone,
      restaurant_name: restaurantName || null,
      city: city || null,
      comenzi_per_zi: comenziPerZi,
      aov_lei: aovLei,
      estimated_savings_monthly_lei: estimatedSavingsMonthlyLei,
    })
    .select('id')
    .single();

  if (dbError || !inserted?.id) {
    console.error('[calculator-leads] insert failed', dbError?.message);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  await notifyTelegram({
    id: inserted.id as string,
    phone,
    restaurantName: restaurantName || null,
    city: city || null,
    comenziPerZi,
    aovLei,
    estimatedSavingsMonthlyLei,
  });

  return NextResponse.json({ ok: true });
}
