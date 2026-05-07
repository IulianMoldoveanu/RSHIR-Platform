'use server';

// Platform-admin server actions for Fleet Allocation V1 grid.
// Gated by HIR_PLATFORM_ADMIN_EMAILS env var (same pattern as
// /dashboard/admin/fleet-managers + /dashboard/admin/partners).
//
// Confidentiality: every assignment row is internal-only. The audit goes
// to the platform-sentinel tenant_id, NOT the restaurant tenant — merchants
// must never see "fleet_assignment_*" events in their audit feed.
//
// PR1b scope locks: assignment CRUD (create / promote / terminate) +
// recommendations (read-only algorithm pass over current state). Strikes
// remain platform-admin-only with no UI yet (PR1e). The fleet_zones
// editor + demand_estimates entry forms ship in PR1c/PR1d.

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import {
  recommendAllocations,
  type AllocationOutput,
} from '@/lib/fleet-allocation/algorithm';
import {
  loadGridData,
  loadDemandEstimatesForSlot,
} from '@/lib/fleet-allocation/queries';
import { buildAlgorithmInputs } from '@/lib/fleet-allocation/recommendation-mapper';

const REVALIDATE = '/dashboard/admin/fleet-allocation';

// Same sentinel pattern as fleet-managers/actions.ts. The audit_log FK on
// public.tenants(id) rejects this UUID, logAudit swallows the error, and
// the row never lands in any tenant's audit feed. Trade-off accepted in
// service of merchant-facing confidentiality (Fleet Network rule).
const PLATFORM_SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// ────────────────────────────────────────────────────────────────────────
// Platform-admin gate (same body as fleet-managers/actions.ts).
// ────────────────────────────────────────────────────────────────────────

async function requirePlatformAdmin(): Promise<
  { userId: string; email: string } | { error: string }
> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Neautentificat.' };

  const allowList = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowList.includes(user.email.toLowerCase())) {
    return { error: 'Acces interzis: nu sunteți administrator de platformă.' };
  }

  return { userId: user.id, email: user.email };
}

export type AssignmentActionResult =
  | { ok: true; assignment_id?: string }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────────────────
// assignFleet
//
// Upserts a (fleet, restaurant, role) row. The migration's partial-unique
// index `fra_one_active_primary_per_restaurant` guarantees at most ONE
// active primary per restaurant at the DB level — we surface its violation
// as a friendly RO error rather than the bare Postgres message.
//
// Idempotency: a paired `fra_unique_fleet_restaurant_role` index means a
// repeat call for the same (fleet, restaurant, role) re-uses the existing
// row. We resurrect terminated/paused rows by flipping status back to
// 'active' instead of inserting a duplicate.
// ────────────────────────────────────────────────────────────────────────

export async function assignFleet(input: {
  fleet_id: string;
  restaurant_tenant_id: string;
  role: 'primary' | 'secondary';
  notes?: string;
}): Promise<AssignmentActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  if (!input.fleet_id || !input.restaurant_tenant_id) {
    return { ok: false, error: 'Parametri lipsă.' };
  }
  if (input.role !== 'primary' && input.role !== 'secondary') {
    return { ok: false, error: 'Rol invalid.' };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Look for any existing row for this (fleet, restaurant, role) tuple —
  // status-agnostic — so we can re-activate a previously terminated row
  // instead of hitting the unique constraint on re-assignment.
  const { data: existing, error: readErr } = await sb
    .from('fleet_restaurant_assignments')
    .select('id, status')
    .eq('fleet_id', input.fleet_id)
    .eq('restaurant_tenant_id', input.restaurant_tenant_id)
    .eq('role', input.role)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  let assignmentId: string;

  if (existing) {
    if (existing.status === 'active') {
      return { ok: true, assignment_id: existing.id }; // already done
    }
    const { data: updated, error } = await sb
      .from('fleet_restaurant_assignments')
      .update({
        status: 'active',
        assigned_by: guard.userId,
        assigned_at: new Date().toISOString(),
        terminated_at: null,
        paused_at: null,
        notes: input.notes ?? null,
      })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) return { ok: false, error: friendlyError(error.message, input.role) };
    assignmentId = updated.id;
  } else {
    const { data: inserted, error } = await sb
      .from('fleet_restaurant_assignments')
      .insert({
        fleet_id: input.fleet_id,
        restaurant_tenant_id: input.restaurant_tenant_id,
        role: input.role,
        status: 'active',
        assigned_by: guard.userId,
        notes: input.notes ?? null,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: friendlyError(error.message, input.role) };
    assignmentId = inserted.id;
  }

  await logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT_ID,
    actorUserId: guard.userId,
    action: 'fleet_assignment_created',
    entityType: 'fleet_restaurant_assignment',
    entityId: assignmentId,
    metadata: {
      fleet_id: input.fleet_id,
      restaurant_tenant_id: input.restaurant_tenant_id,
      role: input.role,
    },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, assignment_id: assignmentId };
}

// ────────────────────────────────────────────────────────────────────────
// promoteToPrimary
//
// Two-step: terminate any existing ACTIVE primary for the same restaurant
// (frees the partial-unique index), then re-activate / insert the secondary
// row at role='primary'. Wrapped in best-effort sequential calls because
// service_role does not run inside an explicit transaction here; the
// partial-unique index guarantees we never end up with two active primaries
// (the second insert would just fail).
// ────────────────────────────────────────────────────────────────────────

export async function promoteToPrimary(input: {
  assignment_id: string;
}): Promise<AssignmentActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  if (!input.assignment_id) return { ok: false, error: 'Parametri lipsă.' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: target, error: readErr } = await sb
    .from('fleet_restaurant_assignments')
    .select('id, fleet_id, restaurant_tenant_id, role, status')
    .eq('id', input.assignment_id)
    .single();
  if (readErr) return { ok: false, error: readErr.message };
  if (target.role === 'primary' && target.status === 'active') {
    return { ok: true, assignment_id: target.id }; // already primary
  }

  // Terminate any active primary on the same restaurant.
  const { error: termErr } = await sb
    .from('fleet_restaurant_assignments')
    .update({ status: 'terminated', terminated_at: new Date().toISOString() })
    .eq('restaurant_tenant_id', target.restaurant_tenant_id)
    .eq('role', 'primary')
    .eq('status', 'active');
  if (termErr) return { ok: false, error: termErr.message };

  // Try to update the existing target row to (primary, active). The unique
  // index on (fleet, restaurant, role) means this only works if NO row
  // already exists at (target.fleet_id, target.restaurant, 'primary'). If
  // it does (e.g. terminated history from a previous primary on this same
  // fleet), we resurrect that one and terminate `target`.
  const { data: existingPrimary, error: primaryReadErr } = await sb
    .from('fleet_restaurant_assignments')
    .select('id, status')
    .eq('fleet_id', target.fleet_id)
    .eq('restaurant_tenant_id', target.restaurant_tenant_id)
    .eq('role', 'primary')
    .maybeSingle();
  if (primaryReadErr) return { ok: false, error: primaryReadErr.message };

  let resultId: string;

  if (existingPrimary) {
    // Resurrect the historical primary row + terminate the secondary we
    // were starting from (prevents duplicate stale rows).
    const { error: resErr } = await sb
      .from('fleet_restaurant_assignments')
      .update({
        status: 'active',
        assigned_by: guard.userId,
        assigned_at: new Date().toISOString(),
        terminated_at: null,
        paused_at: null,
      })
      .eq('id', existingPrimary.id);
    if (resErr) return { ok: false, error: resErr.message };

    if (existingPrimary.id !== target.id) {
      await sb
        .from('fleet_restaurant_assignments')
        .update({ status: 'terminated', terminated_at: new Date().toISOString() })
        .eq('id', target.id);
    }
    resultId = existingPrimary.id;
  } else {
    // Flip the secondary row to primary directly.
    const { data: flipped, error: flipErr } = await sb
      .from('fleet_restaurant_assignments')
      .update({
        role: 'primary',
        status: 'active',
        assigned_by: guard.userId,
        assigned_at: new Date().toISOString(),
        terminated_at: null,
        paused_at: null,
      })
      .eq('id', target.id)
      .select('id')
      .single();
    if (flipErr) return { ok: false, error: friendlyError(flipErr.message, 'primary') };
    resultId = flipped.id;
  }

  await logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT_ID,
    actorUserId: guard.userId,
    action: 'fleet_assignment_role_changed',
    entityType: 'fleet_restaurant_assignment',
    entityId: resultId,
    metadata: {
      from_role: target.role,
      to_role: 'primary',
      restaurant_tenant_id: target.restaurant_tenant_id,
      fleet_id: target.fleet_id,
    },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, assignment_id: resultId };
}

// ────────────────────────────────────────────────────────────────────────
// terminateAssignment
// ────────────────────────────────────────────────────────────────────────

export async function terminateAssignment(input: {
  assignment_id: string;
}): Promise<AssignmentActionResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };
  if (!input.assignment_id) return { ok: false, error: 'Parametri lipsă.' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: row, error: readErr } = await sb
    .from('fleet_restaurant_assignments')
    .select('id, fleet_id, restaurant_tenant_id, role, status')
    .eq('id', input.assignment_id)
    .single();
  if (readErr) return { ok: false, error: readErr.message };

  if (row.status === 'terminated') {
    return { ok: true, assignment_id: row.id };
  }

  const { error } = await sb
    .from('fleet_restaurant_assignments')
    .update({ status: 'terminated', terminated_at: new Date().toISOString() })
    .eq('id', input.assignment_id);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT_ID,
    actorUserId: guard.userId,
    action: 'fleet_assignment_terminated',
    entityType: 'fleet_restaurant_assignment',
    entityId: row.id,
    metadata: {
      fleet_id: row.fleet_id,
      restaurant_tenant_id: row.restaurant_tenant_id,
      role: row.role,
    },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, assignment_id: row.id };
}

// ────────────────────────────────────────────────────────────────────────
// runRecommendations
//
// Loads current grid + demand estimates, runs the pure algorithm, returns
// the recommendation set to the page (no auto-apply). Audit row records
// inputs cardinality + needs_new_fleet flag for traceability across runs.
//
// Default peak slot: Friday 19:00 local (day_of_week=5, hour=19) — matches
// the Iulian-named industry reference point.
// ────────────────────────────────────────────────────────────────────────

export type RunRecommendationsResult =
  | { ok: true; output: AllocationOutput; sampled_at: string }
  | { ok: false; error: string };

export async function runRecommendations(input?: {
  day_of_week?: number;
  hour?: number;
}): Promise<RunRecommendationsResult> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const day = clampInt(input?.day_of_week ?? 5, 0, 6);
  const hour = clampInt(input?.hour ?? 19, 0, 23);

  let grid: Awaited<ReturnType<typeof loadGridData>>;
  let demandByCity: Map<string, number>;
  try {
    [grid, demandByCity] = await Promise.all([
      loadGridData(),
      loadDemandEstimatesForSlot(day, hour),
    ]);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const { fleets, restaurants } = buildAlgorithmInputs(grid, demandByCity);
  const output = recommendAllocations({ fleets, restaurants });

  await logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT_ID,
    actorUserId: guard.userId,
    action: 'fleet_realloc_recommendation_run',
    entityType: 'fleet_allocation',
    entityId: `${day}:${hour}`,
    metadata: {
      day_of_week: day,
      hour,
      fleet_count: fleets.length,
      restaurant_count: restaurants.length,
      needs_new_fleet: output.needs_new_fleet,
      uncovered_city_count: output.uncovered_city_ids.length,
    },
  });

  return { ok: true, output, sampled_at: new Date().toISOString() };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/**
 * Maps the partial-unique-index violation from PG to a friendly RO message.
 * Other DB errors are surfaced verbatim (callers prefix with action name).
 */
function friendlyError(pgMessage: string, role: 'primary' | 'secondary'): string {
  if (
    pgMessage.includes('fra_one_active_primary_per_restaurant') ||
    pgMessage.includes('fra_unique_fleet_restaurant_role')
  ) {
    return role === 'primary'
      ? 'Restaurantul are deja o flotă primară activă. Promovați secondary-ul existent sau terminați primary-ul actual înainte.'
      : 'Există deja o asociere cu acest rol pentru această flotă și acest restaurant.';
  }
  return pgMessage;
}
