'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { buildLandingPatch, type LandingPatch } from '@/lib/partner-landing/validators';

const REVALIDATE = '/partner-portal';

// ────────────────────────────────────────────────────────────
// Internal: resolve the active partner for the current session.
// Returns null if unauthenticated or no matching active partner.
// ────────────────────────────────────────────────────────────

type PartnerRow = { id: string; name: string };

type AdminWithPartners = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };
};

async function requireActivePartner(): Promise<
  { userId: string; partner: PartnerRow } | { error: string }
> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthentificat.' };

  const admin = createAdminClient() as unknown as AdminWithPartners;
  const { data, error } = await admin
    .from('partners')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) return { error: `Eroare la verificarea partenerului: ${error.message}` };
  if (!data) return { error: 'Nu ești asociat unui cont de partener activ.' };

  return {
    userId: user.id,
    partner: { id: data.id as string, name: data.name as string },
  };
}

// ────────────────────────────────────────────────────────────
// updatePartnerProfile
// Partners can update only their own name + phone.
// ────────────────────────────────────────────────────────────

export type PartnerActionResult = { ok: true } | { ok: false; error: string };

export async function updatePartnerProfile(input: {
  name: string;
  phone: string;
}): Promise<PartnerActionResult> {
  const guard = await requireActivePartner();
  if ('error' in guard) return { ok: false, error: guard.error };

  const name = input.name.trim();
  const phone = input.phone.trim() || null;

  if (!name || name.length < 2) {
    return { ok: false, error: 'Numele trebuie să aibă minim 2 caractere.' };
  }

  const admin = createAdminClient() as unknown as AdminWithPartners;
  const { error } = await admin
    .from('partners')
    .update({ name, phone, updated_at: new Date().toISOString() })
    .eq('id', guard.partner.id);

  if (error) return { ok: false, error: error.message };

  // Audit: pass sentinel tenant_id — FK violation is swallowed by logAudit.
  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: guard.userId,
    action: 'partner.profile_updated',
    entityType: 'partner',
    entityId: guard.partner.id,
    metadata: { name, phone },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// PR3: updatePartnerNotificationSettings
// 3 boolean toggles persisted into partners.notification_settings (jsonb).
// Defaults from PR1 migration: all true except churn (we keep that default
// honest — partners who explicitly toggled it ON before should not be reset).
// ────────────────────────────────────────────────────────────

export async function updatePartnerNotificationSettings(input: {
  on_application_approved: boolean;
  on_tenant_went_live: boolean;
  on_tenant_churned: boolean;
}): Promise<PartnerActionResult> {
  // Codex P2 fix: PENDING partners must be able to save opt-outs too —
  // notably on_application_approved (the one that matters before approval
  // is dispatched). /partner-portal admits PENDING in layout + page, so
  // we mirror that here instead of using the ACTIVE-only guard.
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthentificat.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminLookup = createAdminClient() as any;
  const { data: partnerRow, error: lookupErr } = await adminLookup
    .from('partners')
    .select('id, name')
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'ACTIVE'])
    .maybeSingle();
  if (lookupErr) return { ok: false, error: `Eroare la verificarea partenerului: ${lookupErr.message}` };
  if (!partnerRow) return { ok: false, error: 'Nu ești asociat unui cont de partener.' };
  const guard = { userId: user.id, partner: { id: String(partnerRow.id), name: String(partnerRow.name) } };

  // Whitelist the 3 keys we expose in the UI; future keys (e.g.
  // on_commission_paid) stay at PR1 defaults until a UI ships.
  const settings = {
    on_application_approved: !!input.on_application_approved,
    on_tenant_went_live: !!input.on_tenant_went_live,
    on_tenant_churned: !!input.on_tenant_churned,
    on_commission_paid: true, // pinned — future toggle
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from('partners')
    .update({ notification_settings: settings, updated_at: new Date().toISOString() })
    .eq('id', guard.partner.id);

  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: guard.userId,
    action: 'partner.notification_settings_updated',
    entityType: 'partner',
    entityId: guard.partner.id,
    metadata: settings,
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// updatePartnerBranding (Option A — extend in place)
// Lets the partner edit their own white-label landing_settings jsonb.
// Mirrors apps/.../dashboard/admin/partners/actions.ts updatePartnerLanding,
// but scoped to the partner's own row. Validators are shared.
//
// PENDING partners are allowed: they can polish their /r/<code> landing
// before admin approval — the link itself is shareable from PENDING (per
// Lane T design). No commission risk: status gating is downstream.
// ────────────────────────────────────────────────────────────

export async function updatePartnerBranding(input: LandingPatch): Promise<PartnerActionResult> {
  // Custom guard: include PENDING + ACTIVE (mirrors layout/page admission).
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthentificat.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminLookup = createAdminClient() as any;
  const { data: partnerRow, error: lookupErr } = await adminLookup
    .from('partners')
    .select('id, name')
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'ACTIVE'])
    .maybeSingle();
  if (lookupErr) {
    return { ok: false, error: `Eroare la verificarea partenerului: ${lookupErr.message}` };
  }
  if (!partnerRow) return { ok: false, error: 'Nu ești asociat unui cont de partener.' };
  const partnerId = String(partnerRow.id);

  const built = buildLandingPatch(input);
  if (!built.ok) return { ok: false, error: built.error };
  const patch = built.patch ?? {};
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nimic de actualizat.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  // Try the merge RPC first; fall back to read-modify-write so we never lose
  // pre-existing keys that the UI didn't surface.
  const { error: rpcErr } = await sb.rpc('partner_landing_merge', {
    p_partner_id: partnerId,
    p_patch: patch,
  });
  if (rpcErr) {
    const { data, error: readErr } = await sb
      .from('partners')
      .select('landing_settings')
      .eq('id', partnerId)
      .single();
    if (readErr || !data) {
      return { ok: false, error: readErr?.message ?? 'partner_not_found' };
    }
    const merged = { ...(data.landing_settings ?? {}), ...patch };
    const { error: updErr } = await sb
      .from('partners')
      .update({ landing_settings: merged, updated_at: new Date().toISOString() })
      .eq('id', partnerId);
    if (updErr) return { ok: false, error: updErr.message };
  }

  await logAudit({
    tenantId: '00000000-0000-0000-0000-000000000000',
    actorUserId: user.id,
    // Reuse the existing audit action; same operation as the platform-admin
    // path, just initiated by the partner themselves. The audit row carries
    // actor_user_id so the source of the change is unambiguous.
    action: 'partner.landing_updated',
    entityType: 'partner',
    entityId: partnerId,
    metadata: patch,
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}
