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

  return NextResponse.json({ ok: true });
}
