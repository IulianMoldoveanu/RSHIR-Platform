// POST /api/parteneriat/signup — self-service partner signup.
//
// Creates, in this order (best-effort cleanup on each failure):
//   1. auth.users row (email + password, unconfirmed)
//   2. public.partners row (status=PENDING, tier=AFFILIATE, code=<8 chars>)
//   3. public.affiliate_applications row (status=PENDING, partner_id linked)
//
// Admin approval (existing /dashboard/admin/affiliates) flips the partners
// row from PENDING -> ACTIVE. Until approved, the partner can already log
// in to /partner-portal and share their /r/<code> link, but commissions
// cannot accrue until status=ACTIVE (existing partner_referrals attribution
// in /api/signup gates on partner status indirectly via approve flow).
//
// Defenses (mirror /api/affiliate/apply):
//   - Same-origin gate.
//   - Per-IP rate limit: 5/hour (signup is rarer than form-fill).
//   - Honeypot field.
//   - Email + password length caps; email-already-registered is treated as
//     a generic failure to avoid enumeration.

import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Code alphabet excludes ambiguous characters (0/O, 1/I/L) to keep the code
// readable when typed off a phone screen. Mirrors admin approval flow.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 6;

const schema = z.object({
  full_name: z.string().trim().min(3).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(72),
  phone: z.string().trim().max(40).nullable().optional(),
  audience_type: z.enum(['CREATOR', 'BLOGGER', 'CONSULTANT', 'EXISTING_TENANT', 'OTHER']),
  audience_size: z.number().int().min(0).max(100_000_000).nullable().optional(),
  channels: z.array(z.string().min(1).max(40)).max(20).default([]),
  pitch: z.string().trim().min(20).max(1000),
  honeypot: z.string().max(200).optional(),
});

function randomCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
  }
  return s;
}

function hashIp(ip: string): string {
  const month = new Date().toISOString().slice(0, 7);
  const salt =
    process.env.AFFILIATE_VISITS_SALT ??
    process.env.PARTNER_VISITS_SALT ??
    'static-salt-rotate-monthly';
  return createHash('sha256').update(`${ip}|${month}|${salt}`).digest('hex').slice(0, 32);
}

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  const ip = clientIp(req);
  const rl = checkLimit(`parteneriat-signup:${ip}`, { capacity: 5, refillPerSec: 5 / 3600 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', detail: 'Prea multe încercări. Încearcă peste o oră.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const isSpam = !!data.honeypot && data.honeypot.length > 0;

  // For SPAM submissions: pretend success, persist nothing real. Avoids
  // burning the auth-user quota on bots.
  if (isSpam) {
    return NextResponse.json({ ok: true });
  }

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // ─── 1. Create auth user ────────────────────────────────────────────
  // We deliberately omit email_confirm:true. Supabase sends the default
  // confirmation email; the partner cannot log in until they click the
  // link. This blocks email squatting (same posture as /api/signup).
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
  });
  if (authErr || !created.user) {
    // Generic message — don't leak "email already registered".
    console.error('[parteneriat/signup] auth.createUser failed', authErr?.message);
    return NextResponse.json(
      { error: 'signup_failed', detail: 'Nu am putut crea contul. Verifică datele și încearcă din nou.' },
      { status: 400 },
    );
  }
  const userId = created.user.id;

  // ─── 2. Insert partners row (PENDING, with code) ────────────────────
  let partnerId: string | null = null;
  let assignedCode: string | null = null;
  let lastPartnerErr: string | null = null;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = randomCode();
    const { data: row, error: insertErr } = await sb
      .from('partners')
      .insert({
        name: data.full_name,
        email: data.email,
        phone: data.phone ?? null,
        user_id: userId,
        status: 'PENDING',
        tier: 'AFFILIATE',
        default_commission_pct: 0,
        // Bounty defaulted to STANDARD; admin approval can adjust if the
        // partner self-declared as EXISTING_TENANT and that's verified.
        bounty_one_shot_ron: data.audience_type === 'EXISTING_TENANT' ? 600 : 300,
        code,
      })
      .select('id')
      .single();
    if (!insertErr && row) {
      partnerId = String(row.id);
      assignedCode = code;
      break;
    }
    lastPartnerErr = insertErr?.message ?? null;
    if (!/duplicate|unique|partners_code_unique/i.test(lastPartnerErr ?? '')) {
      // Non-collision error — bail and clean up auth user.
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      console.error('[parteneriat/signup] partner insert failed', lastPartnerErr);
      return NextResponse.json(
        { error: 'partner_insert_failed', detail: lastPartnerErr ?? 'unknown' },
        { status: 500 },
      );
    }
  }
  if (!partnerId || !assignedCode) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json(
      { error: 'code_generation_exhausted' },
      { status: 500 },
    );
  }

  // ─── 3. Insert affiliate_applications row (linked to partner_id) ───
  const ua = req.headers.get('user-agent') ?? '';
  const { error: appErr } = await sb.from('affiliate_applications').insert({
    full_name: data.full_name,
    email: data.email,
    phone: data.phone ?? null,
    audience_type: data.audience_type,
    audience_size: data.audience_size ?? null,
    channels: data.channels,
    pitch: data.pitch,
    honeypot: null,
    ip_hash: hashIp(ip),
    user_agent: ua.slice(0, 500),
    status: 'PENDING',
    partner_id: partnerId,
  });
  if (appErr) {
    // Don't roll back partner / auth user — the audit row is non-critical.
    // Admin can still see the partners row and approve; the application row
    // is just a convenience for the review UI.
    console.warn('[parteneriat/signup] affiliate_applications insert failed (non-fatal)', appErr.message);
  }

  return NextResponse.json({
    ok: true,
    partner_id: partnerId,
    code: assignedCode,
    requiresEmailConfirmation: true,
  });
}
