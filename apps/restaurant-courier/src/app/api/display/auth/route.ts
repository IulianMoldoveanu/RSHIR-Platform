import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { scrypt, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const scryptAsync = promisify(scrypt);

// 12h session cookie
const COOKIE_MAX_AGE = 60 * 60 * 12;

type Body = { tenantSlug: string; pin: string };

/**
 * Hash a PIN for storage.
 * Format: scrypt:<salt_hex>:<hash_hex>
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(pin, salt, 32)) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

/**
 * Verify a candidate PIN against a stored hash.
 * Returns false on any format mismatch instead of throwing.
 */
export async function verifyPin(candidate: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  try {
    const derived = (await scryptAsync(candidate, salt, expected.length)) as Buffer;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tenantSlug, pin } = body;
  if (!tenantSlug || !pin) {
    return NextResponse.json({ error: 'tenantSlug and pin required' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  // Resolve tenantSlug → tenant_id
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .maybeSingle();

  if (tenantErr || !tenant) {
    return NextResponse.json({ error: 'PIN incorect' }, { status: 401 });
  }

  // Look up the PIN record for this tenant
  const { data: pinRow, error: pinErr } = await supabase
    .from('tenant_display_pins')
    .select('pin_hash')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  if (pinErr || !pinRow) {
    // No PIN configured for this tenant
    return NextResponse.json({ error: 'Display PIN not configured for this tenant' }, { status: 404 });
  }

  const ok = await verifyPin(pin, pinRow.pin_hash as string);
  if (!ok) {
    return NextResponse.json({ error: 'PIN incorect' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(`display-auth-${tenantSlug}`, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: `/display/${tenantSlug}`,
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({ ok: true });
}
