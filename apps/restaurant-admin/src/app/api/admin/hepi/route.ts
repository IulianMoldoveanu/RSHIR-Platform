// Hepi Command Center — the unified, cross-vertical AI copilot for the HIR
// delivery network. Platform-admin ONLY (Iulian's god-view); tenants keep their
// own tenant-scoped assistant, couriers their FAQ + dispatcher. This is the
// missing platform layer: it reads the SHARED courier_orders spine (where both
// restaurant + pharma deliveries converge via the mirror) plus fleets, couriers,
// cities, verifications and allocation facts, and EXPLAINS the network state.
//
// POST /api/admin/hepi
//   body: { prompt: string, history?: Array<{role:'user'|'assistant', content:string}> }
//   response: { ok: true, response: string, tools_used: string[],
//               pending_actions: Array<{token,actionId,label,describe,risk}>, mode }
//
// Hepi is now Iulian's EXECUTIVE ORCHESTRATOR: read tools (explain the network)
// + write tools (change platform state). Write tools are a fixed whitelist
// (lib/hepi/action-registry) wrapping existing audited server actions — never
// arbitrary SQL/code.
//
// HARD INVARIANTS:
//   - Autonomy: in 'confirm' mode (default + fail-safe) a write tool is NOT
//     executed — it returns a SIGNED proposal the human approves via
//     /api/admin/hepi/execute. In 'direct' mode it runs immediately. Either way:
//     params re-validated, platform-admin re-checked, audit_log written.
//   - GDPR: tool outputs never include customer_phone / customer_first_name /
//     order items / pharma_metadata. Pharma deliveries surface as operational
//     records only (Art.9 health data stays out of the AI context).
//   - Gated by HIR_PLATFORM_ADMIN_EMAILS — same allow-list as the hub.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { getHepiMode, type HepiMode } from '@/lib/hepi/autonomy';
import { writeToolSpecs, validateAction, WRITE_TOOL_IDS } from '@/lib/hepi/action-registry';
import { signProposal } from '@/lib/hepi/proposals';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

// Cost is a non-concern at this stage (single platform-admin user) — use the
// most capable model for strategic cross-vertical reasoning.
const MODEL = 'claude-opus-4-8';
const MAX_TOOL_TURNS = 6;
const IN_PROGRESS = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

const SYSTEM_PROMPT = `Ești Hepi — copilotul AI al HIR Command Center, cockpitul unic al lui Iulian peste TOATĂ infrastructura de livrare HIR.

Ce ești:
- O singură minte care vede întreaga rețea cross-vertical: livrări de restaurant ȘI de farmacie converg în același bazin de curieri (courier_orders). Tu citești acel bazin comun + flote, curieri, orașe, verificări (KYC/KYF) și alocarea.
- Vorbești cu administratorul platformei (Iulian), nu cu un vendor sau curier. Ai vedere de ansamblu, peste toți vendorii și toate orașele.

Reguli de fier:
- POȚI ACȚIONA, nu doar explica — ești orchestratorul executiv al lui Iulian. Ai tool-uri de CITIRE (vezi rețeaua) și tool-uri de ACȚIUNE (schimbi starea platformei). Folosește o acțiune DOAR când Iulian cere clar o schimbare; altfel explică și recomandă.
- Confirmare (modul ți-l spun mai jos): în modul „confirm" NU se execută nimic direct — propui acțiunea și Iulian o confirmă cu un click; spune clar CE ai propus și că așteaptă confirmarea, NU pretinde că s-a făcut. În modul „direct" acțiunea se execută imediat (tot auditată).
- Alocarea comenzilor pe flote rămâne a motorului determinist — n-o forța manual decât printr-un tool dedicat și doar la cererea lui Iulian.
- GDPR: NU ai și NU inventezi numere de telefon, nume de clienți sau denumiri de medicamente. Livrările de farmacie le vezi doar ca înregistrări operaționale (status, oraș, flotă, tarif). Nu cere și nu fabrica astfel de date.
- Granițe: întrebările profunde de farmacie (validare rețetă, chat pacient, interacțiuni) NU sunt aici — trăiesc în workspace-ul farmaciei. Spune asta clar și pe scurt dacă ești întrebat.

Tool-uri de CITIRE:
- network_snapshot       → pulsul rețelei acum (comenzi restaurant/farma 24h, în curs, flote/curieri activi, verificări în așteptare)
- orders_by_city         → vendori + comenzi pe fiecare oraș (din rollup) + bucket „fără oraș"
- list_recent_orders     → ultimele comenzi (filtru opțional: vertical, status, oraș) — câmpuri operaționale, fără PII
- fleets_overview        → flotele: verticale permise, curieri activi, porți KYC/KYF, status KYF
- verifications_queue    → ce KYC curieri + KYF firme așteaptă aprobare
- explain_allocation     → de ce comenzile unui vendor merg la o flotă (asignări primary/fallback reale)

Tool-uri de ACȚIUNE (schimbă starea — supuse confirmării/modului):
- activate_city / deactivate_city → aduce/scoate un oraș live pe platformă (vizibil public + asignare vendori)
- activate_county_capitals        → activează cele 41 de capitale de județ (bază națională)
- set_tenant_status               → suspendă sau reactivează un vendor
- set_tenant_city → setează orașul canonic al unui vendor
- assign_fleet → asignează o flotă la un vendor (primary/secondary)
- mark_fleet_strike → strike flotă–vendor (auto-pauză la 5/30z)
- verify_fleet_kyf → aprobă/respinge verificarea KYF a unei flote
- create_partner → creează un partener (reseller)
- generate_connect_invoices → generează facturile Connect pe săptămâna trecută
- verify_courier_kyc → aprobă/respinge KYC-ul unui curier
- create_incident / set_incident_status → gestionează incidente pe pagina de status
- promote_fleet_primary / terminate_fleet_assignment → schimbă asignările flotă–vendor
- grant_fleet_manager → acordă rol Fleet Manager (după email) pe un vendor
- onboard_vendor → creează un vendor nou cu cont owner
- create_sibling_location → creează o locație soră (multi-city) a unui vendor

Rutează inteligent: „cum stă rețeaua / azi" → network_snapshot; „pe ce orașe" → orders_by_city; „ce comenzi" → list_recent_orders; „ce flote / curieri" → fleets_overview; „ce am de aprobat" → verifications_queue; „de ce merge X la flota Y" → explain_allocation; „activează/dezactivează oraș", „suspendă vendor" → tool-ul de acțiune potrivit. Pentru sfaturi strategice generale, răspunde direct fără tool.

Stil: română, concis, ton de cockpit operațional. Folosește cifre concrete din tool-uri. Dacă un tool întoarce 0, spune-o simplu. Termină cu un singur pas concret recomandat, nu liste generice.`;

type Tool = {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input_schema: any;
};

const TOOLS: Tool[] = [
  {
    name: 'network_snapshot',
    description:
      'Cross-vertical pulse of the whole network right now: orders restaurant/pharma in the last 24h, in-progress deliveries, active fleets, active couriers, pending KYC + KYF, total vendors, active cities. Use for "how is the network", "today", "pulse".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'orders_by_city',
    description:
      'Per-city rollup: how many vendors operate in each RO city + order counts (last 30d / in-progress / total) from the shared courier spine, plus the "no city" bucket (where un-stamped pharma deliveries sit). Use for "which cities", "per oraș".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_recent_orders',
    description:
      'Most recent deliveries across the network (operational fields only — NO customer phone/name). Optional filters. Use for "last orders", "show pharma orders in progress", etc.',
    input_schema: {
      type: 'object',
      properties: {
        vertical: { type: 'string', enum: ['restaurant', 'pharma'], description: 'Filter by vertical.' },
        status: { type: 'string', description: 'Exact courier_orders status, or "in_progress" for the active set.' },
        city_slug: { type: 'string', description: 'Canonical city slug (e.g. "brasov").' },
        limit: { type: 'number', description: 'Max rows, 1-30 (default 15).' },
      },
      required: [],
    },
  },
  {
    name: 'fleets_overview',
    description:
      'All courier fleets: allowed verticals, active courier count, KYC/KYF gates, and KYF verification status. Use for "fleets", "who delivers", "fleet readiness".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'verifications_queue',
    description:
      'Pending verifications awaiting platform approval: courier KYC (identity) + fleet KYF (company legitimacy). Use for "what do I need to approve", "verificări".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'explain_allocation',
    description:
      "Explains WHY a vendor's orders go to a given fleet, by reading the real deterministic assignments (primary + fallback, role + status) and the fleet's attributes. READ-ONLY — never changes allocation. Provide the vendor slug or name.",
    input_schema: {
      type: 'object',
      properties: {
        vendor: { type: 'string', description: 'Tenant slug or name fragment (e.g. "foisorul-a").' },
      },
      required: ['vendor'],
    },
  },
];

// Read tools + the write-action whitelist (lib/hepi/action-registry).
const ALL_TOOLS: Tool[] = [...TOOLS, ...writeToolSpecs()];

function modeNote(mode: HepiMode): string {
  return mode === 'direct'
    ? '\n\nMOD CURENT: direct — acțiunile se execută imediat când Iulian cere o schimbare.'
    : '\n\nMOD CURENT: confirm — NU executa direct; propune acțiunea și spune că așteaptă confirmarea lui Iulian.';
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type Message = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

// ─── Tool executors (all SELECT-only via service-role) ───────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execNetworkSnapshot(sb: any): Promise<string> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function c(table: string, build: (q: any) => any): Promise<number | null> {
    try {
      const { count, error } = await build(sb.from(table).select('*', { count: 'exact', head: true }));
      return error ? null : (count ?? 0);
    } catch {
      return null;
    }
  }
  const [restaurant24h, pharma24h, inProgress, fleets, couriers, kyc, kyf, vendors] =
    await Promise.all([
      c('courier_orders', (q) => q.eq('vertical', 'restaurant').gte('created_at', since)),
      c('courier_orders', (q) => q.eq('vertical', 'pharma').gte('created_at', since)),
      c('courier_orders', (q) => q.in('status', IN_PROGRESS)),
      c('courier_fleets', (q) => q.eq('is_active', true)),
      c('courier_profiles', (q) => q.eq('status', 'ACTIVE')),
      c('courier_kyc', (q) => q.eq('kyc_status', 'PENDING')),
      c('fleet_kyf', (q) => q.eq('kyf_status', 'PENDING')),
      c('tenants', (q) => q.not('city_id', 'is', null)),
    ]);
  return JSON.stringify({
    orders_restaurant_24h: restaurant24h,
    orders_pharma_24h: pharma24h,
    orders_in_progress: inProgress,
    active_fleets: fleets,
    active_couriers: couriers,
    pending_kyc: kyc,
    pending_kyf: kyf,
    vendors_with_city: vendors,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execOrdersByCity(sb: any): Promise<string> {
  const { data, error } = await sb
    .from('v_city_delivery_rollup')
    .select('name, county, vendor_count, orders_30d, orders_in_progress, orders_total')
    .order('sort_order', { ascending: true });
  if (error) return JSON.stringify({ error: 'rollup_unavailable' });
  const cities = (data ?? []) as Array<Record<string, unknown>>;
  const [{ count: noCity }, { count: pharmaNoCity }] = await Promise.all([
    sb.from('courier_orders').select('*', { count: 'exact', head: true }).is('city_id', null),
    sb
      .from('courier_orders')
      .select('*', { count: 'exact', head: true })
      .is('city_id', null)
      .eq('vertical', 'pharma'),
  ]);
  return JSON.stringify({
    cities: cities.filter((r) => (r.vendor_count as number) > 0 || (r.orders_total as number) > 0),
    cities_total: cities.length,
    unassigned: { orders_no_city: noCity ?? 0, pharma_orders_no_city: pharmaNoCity ?? 0 },
    note: 'Pharma deliveries are not yet city-stamped by the mirror, so they sit in orders_no_city.',
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execListRecentOrders(sb: any, input: Record<string, unknown>): Promise<string> {
  const limit = Math.min(30, Math.max(1, Number(input.limit) || 15));
  const vertical = input.vertical === 'restaurant' || input.vertical === 'pharma' ? input.vertical : null;
  const statusRaw = typeof input.status === 'string' ? input.status : null;
  const citySlug = typeof input.city_slug === 'string' ? input.city_slug.trim().toLowerCase() : null;

  let cityId: string | null = null;
  if (citySlug) {
    const { data: city } = await sb.from('cities').select('id').eq('slug', citySlug).maybeSingle();
    cityId = (city as { id: string } | null)?.id ?? null;
  }

  // GDPR: operational fields ONLY — no customer_phone / customer_first_name /
  // items / pharma_metadata.
  let q = sb
    .from('courier_orders')
    .select(
      'id, vertical, status, fleet_id, city_id, delivery_fee_ron, total_ron, payment_method, pickup_line1, dropoff_line1, assigned_courier_user_id, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (vertical) q = q.eq('vertical', vertical);
  if (statusRaw === 'in_progress') q = q.in('status', IN_PROGRESS);
  else if (statusRaw) q = q.eq('status', statusRaw);
  if (cityId) q = q.eq('city_id', cityId);

  const { data } = await q;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return JSON.stringify({ count: 0, orders: [] });

  const fleetIds = Array.from(new Set(rows.map((r) => r.fleet_id).filter(Boolean) as string[]));
  const cityIds = Array.from(new Set(rows.map((r) => r.city_id).filter(Boolean) as string[]));
  const [fleetRes, cityRes] = await Promise.all([
    fleetIds.length ? sb.from('courier_fleets').select('id, name').in('id', fleetIds) : { data: [] },
    cityIds.length ? sb.from('cities').select('id, name').in('id', cityIds) : { data: [] },
  ]);
  const fleetName = new Map((fleetRes.data ?? []).map((f: { id: string; name: string }) => [f.id, f.name]));
  const cityName = new Map((cityRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

  return JSON.stringify({
    count: rows.length,
    orders: rows.map((r) => ({
      short_id: String(r.id).slice(0, 8),
      vertical: r.vertical ?? '—',
      status: r.status,
      fleet: r.fleet_id ? (fleetName.get(r.fleet_id as string) ?? '—') : '—',
      city: r.city_id ? (cityName.get(r.city_id as string) ?? '—') : null,
      delivery_fee_ron: Number(r.delivery_fee_ron ?? 0),
      total_ron: Number(r.total_ron ?? 0),
      payment: r.payment_method ?? '—',
      pickup: r.pickup_line1 ?? '—',
      dropoff: r.dropoff_line1 ?? '—',
      assigned: Boolean(r.assigned_courier_user_id),
      created_at: r.created_at,
    })),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execFleetsOverview(sb: any): Promise<string> {
  const { data: fleets } = await sb
    .from('courier_fleets')
    .select('id, name, slug, tier, allowed_verticals, is_active, kyc_required, kyf_required')
    .order('name', { ascending: true })
    .limit(100);
  const fleetRows = (fleets ?? []) as Array<Record<string, unknown>>;
  const ids = fleetRows.map((f) => f.id as string);

  const courierByFleet = new Map<string, number>();
  const kyfByFleet = new Map<string, string>();
  if (ids.length) {
    const [{ data: profs }, { data: kyfs }] = await Promise.all([
      sb.from('courier_profiles').select('fleet_id').eq('status', 'ACTIVE').in('fleet_id', ids),
      sb.from('fleet_kyf').select('fleet_id, kyf_status').in('fleet_id', ids),
    ]);
    for (const p of (profs ?? []) as Array<{ fleet_id: string | null }>) {
      if (p.fleet_id) courierByFleet.set(p.fleet_id, (courierByFleet.get(p.fleet_id) ?? 0) + 1);
    }
    for (const k of (kyfs ?? []) as Array<{ fleet_id: string; kyf_status: string }>) {
      kyfByFleet.set(k.fleet_id, k.kyf_status);
    }
  }

  return JSON.stringify({
    count: fleetRows.length,
    fleets: fleetRows.map((f) => ({
      name: f.name,
      slug: f.slug,
      tier: f.tier ?? 'partner',
      verticals: f.allowed_verticals ?? [],
      active: f.is_active,
      active_couriers: courierByFleet.get(f.id as string) ?? 0,
      kyc_required: f.kyc_required,
      kyf_required: f.kyf_required,
      kyf_status: kyfByFleet.get(f.id as string) ?? 'none',
    })),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execVerificationsQueue(sb: any): Promise<string> {
  const [{ data: kyc }, { data: kyf }] = await Promise.all([
    sb
      .from('courier_kyc')
      .select('legal_name, cnp_last4, fleet_id, submitted_at')
      .eq('kyc_status', 'PENDING')
      .order('submitted_at', { ascending: true })
      .limit(25),
    sb
      .from('fleet_kyf')
      .select('company_name, cui, fleet_id, submitted_at')
      .eq('kyf_status', 'PENDING')
      .order('submitted_at', { ascending: true })
      .limit(25),
  ]);
  const kycRows = (kyc ?? []) as Array<Record<string, unknown>>;
  const kyfRows = (kyf ?? []) as Array<Record<string, unknown>>;

  const fleetIds = Array.from(
    new Set([...kycRows, ...kyfRows].map((r) => r.fleet_id).filter(Boolean) as string[]),
  );
  const fleetName = new Map<string, string>();
  if (fleetIds.length) {
    const { data: fl } = await sb.from('courier_fleets').select('id, name').in('id', fleetIds);
    for (const f of (fl ?? []) as Array<{ id: string; name: string }>) fleetName.set(f.id, f.name);
  }

  return JSON.stringify({
    pending_kyc_count: kycRows.length,
    pending_kyf_count: kyfRows.length,
    kyc: kycRows.map((r) => ({
      courier: r.legal_name ?? '—',
      cnp_last4: r.cnp_last4 ?? null,
      fleet: r.fleet_id ? (fleetName.get(r.fleet_id as string) ?? '—') : '—',
      submitted_at: r.submitted_at,
    })),
    kyf: kyfRows.map((r) => ({
      company: r.company_name ?? '—',
      cui: r.cui ?? null,
      fleet: r.fleet_id ? (fleetName.get(r.fleet_id as string) ?? '—') : '—',
      submitted_at: r.submitted_at,
    })),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execExplainAllocation(sb: any, input: Record<string, unknown>): Promise<string> {
  const vendor = String(input.vendor ?? '').trim();
  if (!vendor) return JSON.stringify({ error: 'vendor_required' });

  // Resolve tenant by slug first, then name fragment.
  let { data: tenants } = await sb
    .from('tenants')
    .select('id, name, slug, vertical, status, city_id')
    .eq('slug', vendor.toLowerCase())
    .limit(1);
  if (!tenants || tenants.length === 0) {
    const r = await sb
      .from('tenants')
      .select('id, name, slug, vertical, status, city_id')
      .ilike('name', `%${vendor}%`)
      .limit(2);
    tenants = r.data ?? [];
  }
  const tRows = (tenants ?? []) as Array<Record<string, unknown>>;
  if (tRows.length === 0) return JSON.stringify({ error: 'vendor_not_found', vendor });
  if (tRows.length > 1)
    return JSON.stringify({ error: 'ambiguous', matches: tRows.map((t) => t.slug) });
  const t = tRows[0];

  let cityName: string | null = null;
  if (t.city_id) {
    const { data: city } = await sb.from('cities').select('name').eq('id', t.city_id).maybeSingle();
    cityName = (city as { name: string } | null)?.name ?? null;
  }

  const { data: assigns } = await sb
    .from('fleet_restaurant_assignments')
    .select('fleet_id, role, status, assigned_at, notes')
    .eq('restaurant_tenant_id', t.id)
    .order('assigned_at', { ascending: true });
  const aRows = (assigns ?? []) as Array<Record<string, unknown>>;

  const fleetIds = Array.from(new Set(aRows.map((a) => a.fleet_id).filter(Boolean) as string[]));
  const fleetMap = new Map<string, Record<string, unknown>>();
  if (fleetIds.length) {
    const { data: fl } = await sb
      .from('courier_fleets')
      .select('id, name, tier, allowed_verticals, is_active')
      .in('id', fleetIds);
    for (const f of (fl ?? []) as Array<Record<string, unknown>>) fleetMap.set(f.id as string, f);
  }

  // Active courier count per assigned fleet (capacity context for the explanation).
  const courierByFleet = new Map<string, number>();
  if (fleetIds.length) {
    const { data: profs } = await sb
      .from('courier_profiles')
      .select('fleet_id')
      .eq('status', 'ACTIVE')
      .in('fleet_id', fleetIds);
    for (const p of (profs ?? []) as Array<{ fleet_id: string | null }>) {
      if (p.fleet_id) courierByFleet.set(p.fleet_id, (courierByFleet.get(p.fleet_id) ?? 0) + 1);
    }
  }

  // Mirror the trigger's routing: orders go to the active primary fleet; if
  // none, they fall back to the active owner-tier fleet. Resolve the fallback
  // so the explanation is concrete (still read-only — we explain, never write).
  const activePrimary = aRows.find((a) => a.role === 'primary' && a.status === 'active');
  let fallbackFleetName: string | null = null;
  if (!activePrimary) {
    const { data: owner } = await sb
      .from('courier_fleets')
      .select('name')
      .eq('tier', 'owner')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    fallbackFleetName = (owner as { name: string } | null)?.name ?? null;
  }
  const effectiveFleet = activePrimary
    ? ((fleetMap.get(activePrimary.fleet_id as string)?.name as string | undefined) ?? '—')
    : fallbackFleetName
      ? `${fallbackFleetName} (fallback owner-tier — fără flotă primary asignată)`
      : 'nicio flotă disponibilă (comanda ar eșua la dispecerizare)';

  return JSON.stringify({
    vendor: { name: t.name, slug: t.slug, vertical: t.vertical, status: t.status, city: cityName },
    effective_fleet: effectiveFleet,
    assignments: aRows.map((a) => {
      const f = a.fleet_id ? fleetMap.get(a.fleet_id as string) : undefined;
      return {
        fleet: f?.name ?? '—',
        fleet_tier: f?.tier ?? '—',
        fleet_verticals: f?.allowed_verticals ?? [],
        fleet_active: f?.is_active ?? null,
        fleet_active_couriers: a.fleet_id ? (courierByFleet.get(a.fleet_id as string) ?? 0) : 0,
        role: a.role,
        status: a.status,
        assigned_at: a.assigned_at,
        notes: a.notes ?? null,
      };
    }),
    how_it_works:
      'Comenzile DISPATCHED merg la flota cu role=primary + status=active; dacă lipsește, fallback la flota tier=owner activă. Asignarea e scrisă de motorul determinist (fleet_restaurant_assignments), nu de Hepi.',
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execTool(name: string, sb: any, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'network_snapshot':
      return execNetworkSnapshot(sb);
    case 'orders_by_city':
      return execOrdersByCity(sb);
    case 'list_recent_orders':
      return execListRecentOrders(sb, input);
    case 'fleets_overview':
      return execFleetsOverview(sb);
    case 'verifications_queue':
      return execVerificationsQueue(sb);
    case 'explain_allocation':
      return execExplainAllocation(sb, input);
    default:
      return JSON.stringify({ error: `unknown_tool: ${name}` });
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!isPlatformAdminEmail(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { prompt, history } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const mode = await getHepiMode();
  const messages: Message[] = [...history, { role: 'user', content: prompt }];
  let responseText = '';
  let errorText: string | null = null;
  const toolsUsed: string[] = [];
  const pendingActions: Array<{
    token: string;
    actionId: string;
    label: string;
    describe: string;
    risk: 'low' | 'high';
  }> = [];
  // Credentials/secrets from direct-mode executions — returned to the client
  // only, deliberately kept out of `messages` (LLM context) + audit log.
  const sensitiveNotes: string[] = [];

  try {
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2048,
          system: SYSTEM_PROMPT + modeNote(mode),
          tools: ALL_TOOLS,
          messages,
        }),
      });
      if (!res.ok) {
        errorText = `anthropic_${res.status}`;
        const detail = await res.text().catch(() => '');
        console.error('[hepi-command-center] anthropic failed', res.status, detail);
        break;
      }
      const data = (await res.json()) as {
        content: ContentBlock[];
        stop_reason?: string;
      };

      const textParts = data.content
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text);
      if (textParts.length > 0) responseText = textParts.join('\n').trim();

      if (data.stop_reason !== 'tool_use') break;

      const toolUses = data.content.filter(
        (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      if (toolUses.length === 0) break;

      const toolResults: ContentBlock[] = [];
      for (const tu of toolUses) {
        toolsUsed.push(tu.name);

        if (WRITE_TOOL_IDS.has(tu.name)) {
          // Write action: validate, then either propose (confirm mode) or run (direct mode).
          const v = validateAction(tu.name, tu.input ?? {});
          if (!v.ok) {
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: v.error }) });
            continue;
          }
          if (mode === 'direct') {
            const r = await v.action.execute(v.params);
            void logAudit({
              tenantId: '00000000-0000-0000-0000-000000000000',
              actorUserId: user.id,
              action: 'hepi.action_executed',
              entityType: 'hepi_action',
              entityId: v.action.id,
              metadata: { params: v.params, ok: r.ok, via: 'direct' },
            });
            // r.sensitive (e.g. a temp password) goes ONLY to the client, never
            // into the tool_result we feed back to the LLM (which lands in the
            // model context + API logs).
            if (r.sensitive) sensitiveNotes.push(r.sensitive);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: JSON.stringify({ executed: true, ok: r.ok, message: r.message }),
            });
          } else {
            const token = signProposal(tu.name, v.params);
            pendingActions.push({
              token,
              actionId: tu.name,
              label: v.action.label,
              describe: v.describe,
              risk: v.action.risk,
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: JSON.stringify({
                proposed: true,
                awaiting_confirmation: true,
                note: 'Propus. Așteaptă confirmarea lui Iulian în UI — NU presupune că s-a executat.',
              }),
            });
          }
          continue;
        }

        const out = await execTool(tu.name, sb, tu.input ?? {});
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      messages.push({ role: 'assistant', content: data.content });
      messages.push({ role: 'user', content: toolResults });
    }
  } catch (e) {
    errorText = e instanceof Error ? e.message : 'unknown';
    console.error('[hepi-command-center] threw', errorText);
  }

  if (errorText && !responseText) {
    return NextResponse.json({ error: 'ai_call_failed', detail: errorText }, { status: 502 });
  }
  if (!responseText && pendingActions.length > 0) {
    responseText = 'Am pregătit acțiunea — confirmă mai jos pentru a o executa.';
  }
  return NextResponse.json({
    ok: true,
    response: responseText,
    tools_used: toolsUsed,
    pending_actions: pendingActions,
    sensitive_notes: sensitiveNotes,
    mode,
  });
}
