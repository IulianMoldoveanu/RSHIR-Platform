'use server';

// Server actions for Hepy + future programmatic callers (e.g. dashboard chat).
// The REST endpoint at /api/zones/[id]/pause is the canonical write surface
// for the patron-facing toggle; these wrappers add fuzzy zone resolution
// ("Răcădău", "zona 3", "Tractorul") so an NL caller doesn't need a UUID.
//
// Hepy chat-tool integration (orchestrator intent registration) is a
// follow-up — this file exposes the primitive so the integration is a
// one-call wrapper, not a full new module.

import { createServerClient } from '@/lib/supabase/server';
import { getActiveTenant, canManageZones } from '@/lib/tenant';

export type HepyPauseResult =
  | { ok: true; zoneId: string; zoneName: string; pausedUntil: string | null }
  | { ok: false; error: 'unauthorized' | 'no_match' | 'multiple_matches' | 'already_paused' | 'db_error'; matches?: { id: string; name: string }[] };

type HepyPauseInput = {
  // What the user said: full name, locality slug, "zona 3", etc. Case insensitive.
  zoneQuery: string;
  reason: string;
  // 0 / undefined = pause until manually resumed.
  durationMinutes?: number;
  notes?: string;
};

/**
 * Pause a delivery zone by fuzzy name match within the active tenant.
 *
 * Strategy:
 *   1. Try exact (case-insensitive) match on `name` or any locality in the zone.
 *   2. If no exact, try ILIKE %query% on `name`.
 *   3. If multiple zones match the substring, return all candidates so Hepy
 *      can ask the user to disambiguate ("ai vrut Z2 sau Z3?").
 *
 * Called from Hepy. paused_via = 'HEPY' so Insights can later show how many
 * actions originated from the AI vs from manual toggles.
 */
export async function hepyPauseDeliveryZone(input: HepyPauseInput): Promise<HepyPauseResult> {
  const { user, tenant } = await getActiveTenant();
  const allowed = await canManageZones(user.id, tenant.id);
  if (!allowed) return { ok: false, error: 'unauthorized' };

  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const q = input.zoneQuery.trim();
  if (!q) return { ok: false, error: 'no_match' };

  const { data: zones, error: lookupErr } = await sb
    .from('delivery_zones')
    .select('id, name')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true);
  if (lookupErr) {
    console.error('[hepy/pause] zone lookup failed', { tenantId: tenant.id, message: lookupErr.message });
    return { ok: false, error: 'db_error' };
  }
  const list = (zones ?? []) as { id: string; name: string }[];
  if (list.length === 0) return { ok: false, error: 'no_match' };

  const qLower = q.toLowerCase();
  const exact = list.filter((z) => z.name.toLowerCase() === qLower);
  const matches = exact.length > 0 ? exact : list.filter((z) => z.name.toLowerCase().includes(qLower));

  if (matches.length === 0) return { ok: false, error: 'no_match' };
  if (matches.length > 1) {
    return { ok: false, error: 'multiple_matches', matches };
  }

  const zone = matches[0]!;
  const pausedUntil =
    input.durationMinutes && input.durationMinutes > 0
      ? new Date(Date.now() + input.durationMinutes * 60_000).toISOString()
      : null;

  const insertRes = await sb
    .from('tenant_zone_pauses')
    .insert({
      tenant_id: tenant.id,
      zone_id: zone.id,
      reason: input.reason,
      paused_until: pausedUntil,
      paused_by: user.id,
      paused_via: 'HEPY',
      notes: input.notes ?? null,
    })
    .select('id')
    .single();

  if (insertRes.error) {
    if (insertRes.error.code === '23505') return { ok: false, error: 'already_paused' };
    console.error('[hepy/pause] insert failed', {
      tenantId: tenant.id,
      zoneId: zone.id,
      code: insertRes.error.code,
      message: insertRes.error.message,
    });
    return { ok: false, error: 'db_error' };
  }

  return { ok: true, zoneId: zone.id, zoneName: zone.name, pausedUntil };
}

/**
 * Resume any active pause for a zone matched by fuzzy name (mirrors pause).
 */
export async function hepyResumeDeliveryZone(zoneQuery: string): Promise<HepyPauseResult> {
  const { user, tenant } = await getActiveTenant();
  const allowed = await canManageZones(user.id, tenant.id);
  if (!allowed) return { ok: false, error: 'unauthorized' };

  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const q = zoneQuery.trim();
  if (!q) return { ok: false, error: 'no_match' };

  const { data: zones, error: lookupErr } = await sb
    .from('delivery_zones')
    .select('id, name')
    .eq('tenant_id', tenant.id);
  if (lookupErr) return { ok: false, error: 'db_error' };
  const list = (zones ?? []) as { id: string; name: string }[];

  const qLower = q.toLowerCase();
  const exact = list.filter((z) => z.name.toLowerCase() === qLower);
  const matches = exact.length > 0 ? exact : list.filter((z) => z.name.toLowerCase().includes(qLower));

  if (matches.length === 0) return { ok: false, error: 'no_match' };
  if (matches.length > 1) return { ok: false, error: 'multiple_matches', matches };

  const zone = matches[0]!;
  const { data, error } = await sb
    .from('tenant_zone_pauses')
    .update({
      resumed_at: new Date().toISOString(),
      resumed_by: user.id,
      resumed_via: 'HEPY',
    })
    .eq('tenant_id', tenant.id)
    .eq('zone_id', zone.id)
    .is('resumed_at', null)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: 'db_error' };
  if (!data) return { ok: false, error: 'no_match' };
  return { ok: true, zoneId: zone.id, zoneName: zone.name, pausedUntil: null };
}
