import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// RSHIR-20: rate-limit + same-origin check now in place. Captcha is still
// pending if abuse is observed in pilot.

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(SLUG_RE, 'Slug invalid'),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(72),
  ref: z.string().trim().min(3).max(36).optional(),
});

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  // 5 signups per IP per hour: capacity 5, refill ~1/720s.
  const rl = checkLimit(`signup:${clientIp(req)}`, { capacity: 5, refillPerSec: 1 / 720 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { name, slug, email, password, ref } = parsed.data;

  const admin = createAdminClient();

  const { data: existingSlug, error: slugErr } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (slugErr) {
    return NextResponse.json({ error: slugErr.message }, { status: 500 });
  }
  if (existingSlug) {
    return NextResponse.json({ error: 'slug indisponibil' }, { status: 409 });
  }

  // RSHIR-16: do NOT pass email_confirm:true. Supabase will send a confirmation
  // email automatically; the user cannot sign in until they click the link.
  // This blocks the "email squatting" path where an attacker pre-confirms a
  // tenant under a victim's address.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
  });
  if (authErr || !created.user) {
    // Generic message to avoid leaking which emails are already registered.
    console.error('[signup] auth.createUser failed', authErr?.message);
    return NextResponse.json(
      { error: 'Nu am putut crea contul. Verifică datele și încearcă din nou.' },
      { status: 400 },
    );
  }
  const userId = created.user.id;

  const { data: tenantRow, error: tenantErr } = await admin
    .from('tenants')
    .insert({ name, slug, status: 'ACTIVE', vertical: 'RESTAURANT' })
    .select('id')
    .single();
  if (tenantErr || !tenantRow) {
    await admin.auth.admin.deleteUser(userId);
    console.error('[signup] tenant insert failed', tenantErr?.message);
    return NextResponse.json(
      { error: 'Nu am putut crea restaurantul. Încearcă din nou.' },
      { status: 500 },
    );
  }
  const tenantId = tenantRow.id;

  const { error: memberErr } = await admin
    .from('tenant_members')
    .insert({ tenant_id: tenantId, user_id: userId, role: 'OWNER' });
  if (memberErr) {
    await admin.from('tenants').delete().eq('id', tenantId);
    await admin.auth.admin.deleteUser(userId);
    console.error('[signup] tenant_members insert failed', memberErr.message);
    return NextResponse.json(
      { error: 'Nu am putut finaliza înregistrarea. Încearcă din nou.' },
      { status: 500 },
    );
  }

  // Referral attribution — must never fail the signup.
  // partners + partner_referrals are not yet in the generated Supabase types
  // (migration 20260507_003_reseller_program.sql ships with this commit; types
  // regenerate on next `supabase gen types`). Cast through unknown as audit.ts
  // does for audit_log.
  if (ref) {
    try {
      type AnyTable = {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
            };
          };
          insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        };
      };
      const db = admin as unknown as AnyTable;

      const { data: partner, error: partnerLookupErr } = await db
        .from('partners')
        .select('id')
        .eq('id', ref)
        .maybeSingle();
      if (partnerLookupErr) {
        console.warn('[signup] partner lookup error for ref=%s: %s', ref, partnerLookupErr.message);
      } else if (!partner) {
        console.warn('[signup] unknown partner code ref=%s — skipping referral', ref);
      } else {
        const { error: referralErr } = await db
          .from('partner_referrals')
          .insert({ partner_id: partner.id, tenant_id: tenantId });
        if (referralErr) {
          console.error('[signup] partner_referrals insert failed ref=%s: %s', ref, referralErr.message);
        } else {
          void logAudit({
            tenantId,
            actorUserId: null,
            action: 'partner.referral_attributed',
            entityType: 'partner',
            entityId: String(partner.id),
            metadata: { tenant_id: tenantId, partner_id: partner.id, code: ref },
          });
        }
      }
    } catch (e) {
      console.error('[signup] referral attribution threw', e);
    }
  }

  return NextResponse.json(
    { tenantId, userId, slug, requiresEmailConfirmation: true },
    { status: 201 },
  );
}
