import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// One customers row per (tenant_id, auth_user_id) — enforced by
// idx_customers_tenant_auth_user (20260729_001_customer_auth_accounts.sql).
// auth.users is a GLOBAL Supabase identity shared across every tenant on
// the platform; this is the boundary that keeps a person's order history/
// address at Delivery House invisible to, and independent from, their
// account at any other tenant — same auth_user_id, but a different
// customers.id per tenant, each scoped by RLS to auth_user_id = auth.uid()
// AND that row's own tenant_id.
type EnsureResult =
  | { ok: true; customerId: string }
  | { ok: false; error: string };

function splitName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (!fullName) return { firstName: null, lastName: null };
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

/**
 * Finds or creates the customers row for this (tenant, auth identity) pair.
 * Called right after a real login/signup (OAuth callback, email+password
 * signup) — NOT on every page load, since it writes via service-role and
 * the read side (self-service RLS) is what /account normally uses once the
 * row exists.
 */
export async function ensureCustomerForAuthUser(args: {
  tenantId: string;
  authUserId: string;
  email: string | null;
  fullName: string | null;
}): Promise<EnsureResult> {
  const admin = getSupabaseAdmin();

  const { data: existing, error: lookupErr } = await admin
    .from('customers')
    .select('id')
    .eq('tenant_id', args.tenantId)
    .eq('auth_user_id', args.authUserId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (existing) return { ok: true, customerId: existing.id };

  const { firstName, lastName } = splitName(args.fullName);
  const { data: inserted, error: insertErr } = await admin
    .from('customers')
    .insert({
      tenant_id: args.tenantId,
      auth_user_id: args.authUserId,
      email: args.email,
      first_name: firstName,
      last_name: lastName,
    } as never)
    .select('id')
    .single();
  if (insertErr || !inserted) {
    // Unique-violation race (two concurrent requests both missed the
    // lookup) — the other request's row now exists, fetch it instead of
    // surfacing a spurious failure.
    if (insertErr?.code === '23505') {
      const { data: recovered } = await admin
        .from('customers')
        .select('id')
        .eq('tenant_id', args.tenantId)
        .eq('auth_user_id', args.authUserId)
        .maybeSingle();
      if (recovered) return { ok: true, customerId: recovered.id };
    }
    return { ok: false, error: insertErr?.message ?? 'insert_failed' };
  }
  return { ok: true, customerId: inserted.id };
}
