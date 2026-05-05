// POST /api/affiliate/apply — public affiliate-program application intake.
//
// Defenses:
//   - Same-origin gate (CSRF protection).
//   - Per-IP rate limit: 3 / hour. Public form, can't be too tight.
//   - Honeypot field: if `honeypot` non-empty -> mark SPAM silently (bot).
//   - Length caps + email regex + audience_type enum.
//   - IP hash (sha256 + monthly salt) instead of raw IP for compliance.
//
// On success returns 200 { ok: true }. PR review by platform-admin via
// /dashboard/admin/affiliates (separate page, follow-up).

import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/newsletter/resend';
import { affiliatePendingEmail } from '@/lib/email/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  full_name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).nullable().optional(),
  audience_type: z.enum(['CREATOR', 'BLOGGER', 'CONSULTANT', 'EXISTING_TENANT', 'OTHER']),
  audience_size: z.number().int().min(0).max(100_000_000).nullable().optional(),
  channels: z.array(z.string().min(1).max(40)).max(20).default([]),
  pitch: z.string().trim().min(20).max(1000),
  honeypot: z.string().max(200).optional(),
  // Free-text attribution slug from /affiliate?ref=<x>. Sanitized server-side
  // again (defense in depth — client trims to /^[A-Za-z0-9._-]{1,64}$/ but we
  // re-enforce here in case of direct API calls).
  referrer: z.string().trim().max(64).nullable().optional(),
});

function sanitizeReferrer(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().slice(0, 64).toLowerCase();
  if (!v) return null;
  return /^[a-z0-9._-]+$/.test(v) ? v : null;
}

function hashIp(ip: string): string {
  const month = new Date().toISOString().slice(0, 7);
  const salt = process.env.AFFILIATE_VISITS_SALT ?? process.env.PARTNER_VISITS_SALT ?? 'static-salt-rotate-monthly';
  return createHash('sha256').update(`${ip}|${month}|${salt}`).digest('hex').slice(0, 32);
}

export async function POST(req: NextRequest) {
  // Same-origin: prevents a third-party site from spamming applications via
  // a hidden POST in a logged-in customer's browser.
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  // Generous rate limit (real users submit once or twice).
  const ip = clientIp(req);
  const rl = checkLimit(`affiliate-apply:${ip}`, { capacity: 3, refillPerSec: 3 / 3600 });
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

  // Defense: also detect duplicate email submissions in the last 24h. Prevent
  // scammers from spamming the same email through the form repeatedly.
  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recent } = await sb
    .from('affiliate_applications')
    .select('id', { count: 'exact', head: true })
    .eq('email', data.email.toLowerCase())
    .gte('created_at', dayAgo);

  if ((recent ?? 0) >= 2) {
    // Pretend success so an attacker can't enumerate "this email already
    // applied". Real submitter who lost track gets a friendly 200.
    return NextResponse.json({ ok: true, deduped: true });
  }

  const ua = req.headers.get('user-agent') ?? '';
  const insertRow = {
    full_name: data.full_name,
    email: data.email.toLowerCase(),
    phone: data.phone ?? null,
    audience_type: data.audience_type,
    audience_size: data.audience_size ?? null,
    channels: data.channels,
    pitch: data.pitch,
    honeypot: data.honeypot ?? null,
    ip_hash: hashIp(ip),
    user_agent: ua.slice(0, 500),
    status: isSpam ? 'SPAM' : 'PENDING',
    referrer: sanitizeReferrer(data.referrer ?? null),
  };

  const { error } = await sb.from('affiliate_applications').insert(insertRow);
  if (error) {
    console.error('[affiliate/apply] insert failed', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  // Fire-and-forget confirmation email + Telegram alert. Never block on these.
  // (Real submitters get the success state immediately; ops gets the ping.)
  if (!isSpam) {
    void sendApplicationSubmittedEmail({ to: data.email.toLowerCase(), fullName: data.full_name }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

// ────────────────────────────────────────────────────────────────────────
// Application-submitted confirmation email. Uses Resend if configured; if
// not, sendEmail() short-circuits with `not_configured`. Best-effort — the
// audit trail is the affiliate_applications row itself.
// Lane N (2026-05-04): copy + HTML now live in @/lib/email/templates so the
// pending email shares the same shell as approval / newsletter / reservations.
// ────────────────────────────────────────────────────────────────────────

async function sendApplicationSubmittedEmail(args: {
  to: string;
  fullName: string;
}): Promise<void> {
  const tpl = affiliatePendingEmail({ fullName: args.fullName });
  await sendEmail({ to: args.to, subject: tpl.subject, html: tpl.html, text: tpl.text });
}
