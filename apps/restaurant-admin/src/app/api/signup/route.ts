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

  // Seed a permissive default delivery pricing tier so the storefront has
  // valid pricing the moment the OWNER draws their first zone. Without
  // this row, /dashboard/zones requires the OWNER to add at least one
  // tier before any order can be priced — every tenant onboarded so far
  // had to do this manually. Best-effort: a failed insert does not roll
  // back signup; the OWNER can always add tiers later from the zones UI.
  const { error: tierErr } = await admin
    .from('delivery_pricing_tiers')
    .insert({
      tenant_id: tenantId,
      min_km: 0,
      max_km: 15,
      price_ron: 15,
      sort_order: 0,
    });
  if (tierErr) {
    console.warn('[signup] default tier insert failed (non-fatal)', tierErr.message);
  }

  // Referral attribution — must never fail the signup.
  // partners + partner_referrals are not yet in the generated Supabase types
  // (migration 20260507_003_reseller_program.sql ships with this commit; types
  // regenerate on next `supabase gen types`). Cast through unknown as audit.ts
  // does for audit_log.
  if (ref) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbAny = admin as any;
      const cols = 'id, code, tier, bounty_one_shot_ron';
      // UUID-shaped ref -> lookup by id; otherwise lookup by partners.code
      // (white-label codes use [A-Z2-9], no lowercase). Both legacy partner
      // UUIDs and the new short codes work.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
      let partner: { id: string; code?: string | null; tier?: string; bounty_one_shot_ron?: number | null } | null = null;
      let partnerLookupErr: { message: string } | null = null;
      if (isUuid) {
        const r = await dbAny.from('partners').select(cols).eq('id', ref).maybeSingle();
        partner = r.data;
        partnerLookupErr = r.error;
      } else {
        const r = await dbAny.from('partners').select(cols).eq('code', ref.toUpperCase()).maybeSingle();
        partner = r.data;
        partnerLookupErr = r.error;
      }
      if (partnerLookupErr) {
        console.warn('[signup] partner lookup error for ref=%s: %s', ref, partnerLookupErr.message);
      } else if (!partner) {
        console.warn('[signup] unknown partner code ref=%s — skipping referral', ref);
      } else {
        const { error: referralErr } = await dbAny
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

        // Lane T: denormalize the canonical partner code on the tenants row
        // for ad-hoc reporting. Always store partners.code (uppercase short
        // identifier), never the raw ref input — when the ref is a legacy
        // UUID the column would otherwise hold mixed formats.
        if (partner.code) {
          const { error: refCodeErr } = await dbAny
            .from('tenants')
            .update({ referral_code: String(partner.code).toUpperCase() })
            .eq('id', tenantId);
          if (refCodeErr) {
            console.warn('[signup] tenants.referral_code update failed (non-fatal)', refCodeErr.message);
          }
        }

        // Affiliate bounty — when the partner is tier=AFFILIATE, also create
        // a PENDING bounty row (becomes PAYABLE after 30 days; this window
        // lets us cancel for fraud / immediate-churn). Reseller partners
        // (tier=PARTNER/PREMIER) get the recurring partner_commissions
        // monthly cron — not the bounty.
        if (partner.tier === 'AFFILIATE' && partner.bounty_one_shot_ron && partner.bounty_one_shot_ron > 0) {
          const { error: bountyErr } = await dbAny
            .from('affiliate_bounties')
            .insert({
              partner_id: partner.id,
              tenant_id: tenantId,
              amount_ron: partner.bounty_one_shot_ron,
            });
          if (bountyErr && !/duplicate|unique/i.test(bountyErr.message ?? '')) {
            console.error('[signup] affiliate_bounty insert failed', bountyErr.message);
          }
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
