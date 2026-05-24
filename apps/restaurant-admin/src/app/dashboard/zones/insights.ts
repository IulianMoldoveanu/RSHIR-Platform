import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Simple, no-AI zone insights. Computed synchronously when /dashboard/zones
// renders. Surfaces 1-3 immediately actionable observations to the patron
// based on real pause history + delivery data over the last 7-30 days.
//
// Each insight has:
//   - title       short headline ("Z3 a fost pe pauza 3h saptamana asta")
//   - body        1-2 sentences explaining what happened + why it matters
//   - severity    info | warn — drives the badge color
//   - ctaHref     optional in-app link to the action (zone edit, courier page)
//   - ctaLabel    button text
//
// Future PR can promote these into the AI CEO daily-brief copilot pipeline
// so they're surfaced in Telegram + AI CEO widget alongside other agent
// suggestions. For now, this is the cheapest path to "platforma sugereaza
// optimizari" without bolting on a new AI pipeline.

export type ZoneInsight = {
  id: string;
  severity: 'info' | 'warn';
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
};

const PAUSE_WARN_HOURS = 2;
const REFUSED_WARN_COUNT = 5;
const LOOKBACK_DAYS = 7;

type PauseRow = {
  zone_id: string;
  reason: string;
  paused_at: string;
  paused_until: string | null;
  resumed_at: string | null;
};

type ZoneRow = { id: string; name: string };

export async function loadZoneInsights(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
): Promise<ZoneInsight[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [pauseRes, zoneRes] = await Promise.all([
    supabase
      .from('tenant_zone_pauses')
      .select('zone_id, reason, paused_at, paused_until, resumed_at')
      .eq('tenant_id', tenantId)
      .gte('paused_at', since)
      .order('paused_at', { ascending: false })
      .limit(200),
    supabase
      .from('delivery_zones')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .limit(100),
  ]);

  if (pauseRes.error) {
    console.warn('[zone-insights] pause load failed', { tenantId, message: pauseRes.error.message });
    return [];
  }

  const pauses = ((pauseRes.data ?? []) as PauseRow[]) ?? [];
  const zonesById = new Map(
    ((zoneRes.data ?? []) as ZoneRow[]).map((z) => [z.id, z.name] as const),
  );

  return buildInsights(pauses, zonesById);
}

// Pure function — testable without DB.
export function buildInsights(
  pauses: PauseRow[],
  zonesById: Map<string, string>,
): ZoneInsight[] {
  const insights: ZoneInsight[] = [];

  // Aggregate pause duration per zone (in hours) for the lookback window.
  const minutesByZone = new Map<string, { mins: number; reasons: Map<string, number> }>();
  const now = Date.now();
  for (const p of pauses) {
    const start = new Date(p.paused_at).getTime();
    // Effective end: resumed_at (manual), paused_until (auto), or now (still active).
    const candidates: number[] = [now];
    if (p.resumed_at) candidates.push(new Date(p.resumed_at).getTime());
    if (p.paused_until) candidates.push(new Date(p.paused_until).getTime());
    const end = Math.min(...candidates);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const mins = (end - start) / 60_000;
    const cur = minutesByZone.get(p.zone_id) ?? { mins: 0, reasons: new Map() };
    cur.mins += mins;
    cur.reasons.set(p.reason, (cur.reasons.get(p.reason) ?? 0) + 1);
    minutesByZone.set(p.zone_id, cur);
  }

  // Insight 1: any zone with cumulative pause > threshold.
  const heaviest = [...minutesByZone.entries()]
    .map(([zoneId, agg]) => ({
      zoneId,
      hours: +(agg.mins / 60).toFixed(1),
      topReason: pickTopReason(agg.reasons),
    }))
    .filter((x) => x.hours >= PAUSE_WARN_HOURS)
    .sort((a, b) => b.hours - a.hours);

  for (const h of heaviest.slice(0, 2)) {
    const zoneName = zonesById.get(h.zoneId) ?? 'Zonă necunoscută';
    insights.push({
      id: `pause-${h.zoneId}`,
      severity: 'warn',
      title: `${zoneName} a fost pe pauză ${h.hours}h în ultima săptămână`,
      body: pauseBodyFor(h.topReason, zoneName),
      ctaHref: '/dashboard/operations/live-orders',
      ctaLabel: ctaFor(h.topReason),
    });
  }

  // Insight 2: pause count signal — many short pauses suggest oscillation.
  const counts = [...minutesByZone.entries()]
    .map(([zoneId]) => ({ zoneId, count: pauses.filter((p) => p.zone_id === zoneId).length }))
    .filter((x) => x.count >= REFUSED_WARN_COUNT)
    .sort((a, b) => b.count - a.count);

  for (const c of counts.slice(0, 1)) {
    if (insights.some((i) => i.id === `pause-${c.zoneId}`)) continue; // dedup with the duration insight
    const zoneName = zonesById.get(c.zoneId) ?? 'Zonă necunoscută';
    insights.push({
      id: `frequent-${c.zoneId}`,
      severity: 'info',
      title: `${zoneName} oprită de ${c.count} ori în 7 zile`,
      body: 'Pauze dese pot însemna că zona e prea mare sau capacitatea e subdimensionată. Verifică dacă se schimbă ceva structural.',
      ctaHref: `/dashboard/zones`,
      ctaLabel: 'Vezi zona',
    });
  }

  // Insight 3 (positive): no pauses at all in the window — well-run shift.
  if (insights.length === 0 && zonesById.size > 0) {
    insights.push({
      id: 'all-clear',
      severity: 'info',
      title: 'Zero pauze în ultimele 7 zile',
      body: 'Toate zonele tale au acceptat comenzi continuu — semn că ai capacitate bună de curieri și nu te-a prins vremea pe picior greșit.',
    });
  }

  return insights.slice(0, 3);
}

function pickTopReason(reasons: Map<string, number>): string {
  let best = 'manual';
  let bestN = -1;
  for (const [r, n] of reasons.entries()) {
    if (n > bestN) {
      best = r;
      bestN = n;
    }
  }
  return best;
}

function pauseBodyFor(reason: string, zoneName: string): string {
  switch (reason) {
    case 'lipsa_curier':
      return `Motivul principal a fost lipsa curierilor. Pentru ${zoneName} ai putea programa un curier dedicat în orele de vârf sau extinde flota.`;
    case 'furtuna':
      return `Pauzele au fost cauzate de vreme rea. Greu de prevenit, dar e bine de știut pentru estimarea pierderii de vânzări.`;
    case 'sold_out':
      return `Ai rămas fără stoc / produse. Ia în calcul o comandă de aprovizionare mai mare sau setează alerte de stoc.`;
    default:
      return `Motivul a fost setat manual. Verifică dacă există un pattern recurent care merită rezolvat structural.`;
  }
}

function ctaFor(reason: string): string {
  switch (reason) {
    case 'lipsa_curier':
      return 'Vezi capacitate curieri';
    case 'sold_out':
      return 'Vezi inventar';
    default:
      return 'Vezi comenzi live';
  }
}
