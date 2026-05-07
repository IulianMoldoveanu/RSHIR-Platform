'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';

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
  const supabase = createServerClient();
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
  const guard = await requireActivePartner();
  if ('error' in guard) return { ok: false, error: guard.error };

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
