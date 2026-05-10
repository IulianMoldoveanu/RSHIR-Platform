'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const tableSchema = z.object({
  id: z.string().min(1).max(40),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().min(20).max(2000),
  h: z.number().finite().min(20).max(2000),
  seats: z.number().int().min(1).max(20),
  label: z.string().min(1).max(40),
  shape: z.enum(['rect', 'round']).default('rect'),
});

const planSchema = z.object({
  tenantId: z.string().uuid(),
  showToCustomers: z.boolean(),
  // Cap at 200 tables — realistic max + protects payload size + RPC scan cost.
  tables: z.array(tableSchema).max(200),
});

export type SavePlanResult = { ok: true } | { ok: false; error: string };

export async function saveTablePlan(raw: unknown): Promise<SavePlanResult> {
  try {
    const parsed = planSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Date invalide.' };
    }
    const { tenantId, showToCustomers, tables } = parsed.data;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Trebuie să fiți autentificat.' };
    const { tenant } = await getActiveTenant();
    if (tenant.id !== tenantId) return { ok: false, error: 'Tenant mismatch.' };
    await assertTenantMember(user.id, tenantId);

    // Reject duplicate table IDs — they'd break the picker + conflict checks.
    const seen = new Set<string>();
    for (const t of tables) {
      if (seen.has(t.id)) {
        return { ok: false, error: `ID duplicat: ${t.id}` };
      }
      seen.add(t.id);
    }

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;

    // Pre-load current settings so the upsert doesn't blow away the
    // operator-configured advance windows / capacity / notify_email.
    const { data: existing } = await sb
      .from('reservation_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const payload = {
      tenant_id: tenantId,
      // Carry over existing fields (or defaults if no row yet) — we only
      // touch the plan + visibility toggle from this surface.
      is_enabled: existing?.is_enabled ?? false,
      advance_max_days: existing?.advance_max_days ?? 30,
      advance_min_minutes: existing?.advance_min_minutes ?? 60,
      slot_duration_min: existing?.slot_duration_min ?? 90,
      party_size_max: existing?.party_size_max ?? 12,
      capacity_per_slot: existing?.capacity_per_slot ?? 4,
      notify_email: existing?.notify_email ?? null,
      table_plan: { tables },
      show_table_plan_to_customers: showToCustomers,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from('reservation_settings').upsert(payload);
    if (error) return { ok: false, error: error.message };

    await logAudit({
      tenantId,
      actorUserId: user.id,
      action: 'reservation.table_plan_updated',
      entityType: 'reservation_settings',
      entityId: tenantId,
      metadata: { tableCount: tables.length, showToCustomers },
    });

    revalidatePath('/dashboard/reservations/table-plan');
    revalidatePath('/dashboard/reservations');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
