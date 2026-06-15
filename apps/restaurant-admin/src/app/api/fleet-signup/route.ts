// POST /api/fleet-signup — self-serve onboarding for fleet managers.
//
// 2026-06-11 — pair with /fleet-signup page. Creates (1) a Supabase auth user
// (email confirmation sent automatically by Supabase, NO email_confirm:true),
// and (2) a courier_fleets row owned by the new user with kyf_required=true
// and is_active=false. Iulian approves the KYF via /dashboard/admin/verifications.
//
// Pattern mirrors /api/signup (restaurant tenant signup) for rate-limit +
// same-origin + zod validation.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';

export const dynamic = 'force-dynamic';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const CUI_RE = /^(RO)?\d{2,10}$/i;

const fleetSignupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(SLUG_RE, 'Slug invalid'),
  cui: z.string().trim().regex(CUI_RE, 'CUI invalid'),
  phone: z.string().trim().min(9).max(30),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(72),
  // 2026-06-15 — primary_city_id required so fleet-allocation can match
  // tenant↔fleet city. Maps to courier_fleets.primary_city_id (migration
  // 20260615_004).
  primary_city_id: z.string().uuid('Oraș invalid'),
});

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  // 5 signups per IP per hour: capacity 5, refill ~1/720s.
  const rl = checkLimit(`fleet-signup:${clientIp(req)}`, { capacity: 5, refillPerSec: 1 / 720 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = fleetSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Date invalide', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { name, slug, cui, phone, email, password, primary_city_id } = parsed.data;

  const admin = createAdminClient();

  // Slug uniqueness check on courier_fleets (different namespace from tenants).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingSlug, error: slugErr } = await (admin as any)
    .from('courier_fleets')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (slugErr) {
    return NextResponse.json({ error: slugErr.message }, { status: 500 });
  }
  if (existingSlug) {
    return NextResponse.json({ error: 'slug indisponibil' }, { status: 409 });
  }

  // Create auth user with email_confirm:true — bypasses Supabase's email
  // confirmation step. Why: Supabase's default shared email sender is rate-
  // limited (4/h) and routinely blocked by Yahoo/Outlook (no SPF/DKIM for
  // their senders). Fleet managers were getting stuck on "Email not confirmed"
  // with no email arriving. KYF approval (Iulian reviews CUI + docs via
  // /dashboard/admin/verifications, is_active stays false until approved) is
  // the REAL gate — confirming a Yahoo address adds friction with no real
  // verification value here.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !created.user) {
    return NextResponse.json(
      { error: 'Nu am putut crea contul (emailul există deja sau e invalid).' },
      { status: 400 },
    );
  }

  const userId = created.user.id;

  // Create the fleet row. is_active=false until KYF approval; kyf_required=true
  // forces the user through /fleet/kyf before they can dispatch couriers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // 2026-06-15 — derive a 3-letter display_prefix from the first word of
  // the fleet name (e.g. "Els courier delivery srl" -> "ELS", "Eazy Roads"
  // -> "EAZ"). Shows up next to courier names in /verifications and the
  // admin /fleet/couriers list so Iulian instantly sees which fleet a
  // rider belongs to. Owner can override later from /fleet/settings.
  const firstWord = name.trim().split(/\s+/)[0] ?? '';
  const display_prefix = firstWord.slice(0, 3).toUpperCase() || null;

  const { error: fleetErr } = await (admin as any).from('courier_fleets').insert({
    name,
    slug,
    owner_user_id: userId,
    contact_phone: phone,
    primary_city_id,
    display_prefix,
    is_active: false,
    kyf_required: true,
    tier: 'partner',
    allowed_verticals: ['restaurant', 'pharma'],
    delivery_app: 'hir',
  });

  if (fleetErr) {
    // Best-effort rollback of the auth user so a retry can succeed.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: fleetErr.message }, { status: 500 });
  }

  // Seed fleet_kyf row with CUI so Iulian's verification queue surfaces it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: createdFleet } = await (admin as any)
    .from('courier_fleets')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (createdFleet?.id) {
    // Seed fleet_kyf row. Status must be one of PENDING/VERIFIED/REJECTED per
    // fleet_kyf_kyf_status_check constraint on prod (verified 2026-06-11 after
    // a previous "PENDING_DOCS" value silently violated the constraint and the
    // .catch() swallowed the error, leaving fleet_kyf with no row).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('fleet_kyf').insert({
      fleet_id: createdFleet.id,
      cui: cui.toUpperCase().replace(/^RO/, ''),
      company_name: name,
      kyf_status: 'PENDING',
    }).then(() => {}).catch(() => {});
  }

  return NextResponse.json({ ok: true, autoConfirmed: true }, { status: 201 });
}
