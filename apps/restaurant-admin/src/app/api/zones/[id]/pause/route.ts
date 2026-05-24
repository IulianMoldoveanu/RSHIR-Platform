import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireZoneManager } from '@/lib/api-tenant';
import { assertSameOrigin } from '@/lib/origin-check';

export const dynamic = 'force-dynamic';

// Prefab reasons mirror the Control Room modal options. Free text accepted too
// because patrons type whatever's specific to the moment ("ploaie torențială
// pe Coresi", "ramas fara cutii pizza"). Keep loose; surface to Insights later.
const REASON_PRESETS = ['furtuna', 'lipsa_curier', 'sold_out', 'manual'] as const;

const pauseSchema = z.object({
  reason: z.string().min(1).max(200),
  reason_preset: z.enum(REASON_PRESETS).optional(),
  // Duration in minutes. 0 / null = pause until manually resumed.
  duration_minutes: z.number().int().min(0).max(60 * 24).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireZoneManager();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = pauseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  // Verify the zone belongs to the tenant before pausing — partial unique
  // index already prevents double-pause on (tenant_id, zone_id), but we want
  // a clean 404 for cross-tenant access rather than a confusing 400.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.supabase as any;
  const zoneRes = await sb
    .from('delivery_zones')
    .select('id')
    .eq('id', params.id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle();
  if (zoneRes.error || !zoneRes.data) {
    return NextResponse.json({ error: 'zone_not_found' }, { status: 404 });
  }

  const pausedUntil =
    parsed.data.duration_minutes && parsed.data.duration_minutes > 0
      ? new Date(Date.now() + parsed.data.duration_minutes * 60_000).toISOString()
      : null;

  const insertRes = await sb
    .from('tenant_zone_pauses')
    .insert({
      tenant_id: auth.tenantId,
      zone_id: params.id,
      reason: parsed.data.reason,
      paused_until: pausedUntil,
      paused_by: auth.userId,
      paused_via: 'CONTROL_ROOM',
      notes: parsed.data.notes ?? null,
    })
    .select('id, zone_id, reason, paused_until, paused_at, paused_by, paused_via, notes')
    .single();

  if (insertRes.error) {
    // 23505 = unique violation (active pause already exists for this zone).
    if (insertRes.error.code === '23505') {
      return NextResponse.json({ error: 'already_paused' }, { status: 409 });
    }
    console.error('[zones/pause] insert failed', {
      tenantId: auth.tenantId,
      zoneId: params.id,
      code: insertRes.error.code,
      message: insertRes.error.message,
    });
    return NextResponse.json({ error: 'db_error' }, { status: 400 });
  }

  return NextResponse.json({ pause: insertRes.data }, { status: 201 });
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireZoneManager();
  if (!auth.ok) return auth.response;

  // Resume = mark the active pause row with resumed_at + resumed_by + resumed_via.
  // Filter on resumed_at IS NULL to only touch the currently-active pause.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.supabase as any;
  const { data, error } = await sb
    .from('tenant_zone_pauses')
    .update({
      resumed_at: new Date().toISOString(),
      resumed_by: auth.userId,
      resumed_via: 'CONTROL_ROOM',
    })
    .eq('tenant_id', auth.tenantId)
    .eq('zone_id', params.id)
    .is('resumed_at', null)
    .select('id, zone_id, resumed_at')
    .maybeSingle();

  if (error) {
    console.error('[zones/pause] resume failed', {
      tenantId: auth.tenantId,
      zoneId: params.id,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: 'db_error' }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_paused' }, { status: 404 });
  }
  return NextResponse.json({ resumed: data });
}
