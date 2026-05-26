// Hepi Curier — AI assistant for couriers. Wave 2b (tools).
//
// POST /api/courier/hepi
//   body: { prompt: string, history?: Array<{role:'user'|'assistant', content:string}> }
//   response: { ok: true, response: string, run_id: string, tools_used: string[] }
//
// Authenticated couriers only. Calls Anthropic Messages API with three tools
// scoped to the caller's own data:
//   - get_my_active_orders
//   - get_my_earnings_summary
//   - get_available_orders_nearby
//
// All tool calls are issued server-side with the courier's user.id as the
// only authority — Claude cannot reach into another courier's data even
// if it tries.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOOL_TURNS = 4;

const SYSTEM_PROMPT = `You are Hepi Curier, the friendly AI co-pilot for HIR delivery couriers in Romania.

Romanian by default. Concise. Warm. Practical.

You have access to six tools — five read-only + one write.

READ tools (use freely):
- get_my_active_orders        → list of currently assigned orders
- get_my_earnings_summary     → today + this-week earnings totals
- get_available_orders_nearby → CREATED/OFFERED orders in their fleet
- suggest_pickup_order        → greedy nearest-neighbor sequence of active stops, starting from the courier's last GPS
- find_combo_candidates       → unassigned orders within ~1.2 km of an active pickup/dropoff (good combo grouping)

WRITE tool (use ONLY with explicit consent):
- accept_order(short_id_8)    → assigns an unassigned order to this courier and moves it to ACCEPTED. ONLY call when the courier's current message clearly says they want to ACCEPT a specific order (e.g. "accept #a3f2b1", "iau comanda a3f2b1", "ok ia-o pe a3f2b1"). NEVER call this preemptively just because they asked what's available — wait for an explicit accept verb + short id. If unsure, just describe the order and ask "Vrei să o accept?"; the courier will reply with confirmation.

Tool routing:
- Status / counts / money → get_my_active_orders, get_my_earnings_summary
- "What can I pick up?" / "Is it worth staying online?" → get_available_orders_nearby
- "Which way first?" / "What's the order?" → suggest_pickup_order
- "Can I take another one?" / "What's on the way?" → find_combo_candidates
- Explicit accept request → accept_order

For general advice (handling a complaint, route theory, motivational nudges)
answer directly without tools. Don't call a tool just to "double check".

Style:
- Short. 2-3 short paragraphs max unless asked for detail.
- Direct tone, no jargon. Mention concrete numbers from tools when available.
- If a tool returns 0 rows, say so plainly ("Nu ai comenzi active acum").
- Suggest one concrete next step, not a list of generic tips.

Identity: HIR's courier-side counterpart to Hepi (the restaurant assistant).
Two assistants, one platform, same goal — every order delivered well.`;

type Tool = {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input_schema: any;
};

const TOOLS: Tool[] = [
  {
    name: 'get_my_active_orders',
    description:
      "Returns the courier's currently assigned active orders (status ACCEPTED, PICKED_UP, IN_TRANSIT). Use this when the courier asks about their current load, what to do next, or wants to see their queue.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_my_earnings_summary',
    description:
      "Returns the courier's earnings for today and this week (Mon-Sun), based on DELIVERED orders. Use when the courier asks about money, performance, or whether they've hit a goal.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_available_orders_nearby',
    description:
      'Returns up to 5 currently-unassigned orders (status CREATED or OFFERED) in the courier’s fleet. Use when the courier asks what is available to pick up or whether it is worth staying online.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'suggest_pickup_order',
    description:
      "Suggests the optimal order in which to handle the courier's active pickups/dropoffs using a greedy nearest-neighbor heuristic starting from the courier's last known GPS position. Use when the courier has 2+ active orders and asks how to sequence them or which one to go to first.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'find_combo_candidates',
    description:
      "Finds up to 5 unassigned orders in the courier's fleet whose pickup OR dropoff is within ~1.2 km of one of the courier's currently active orders. Use when the courier asks if there is anything worth grouping / 'pot lua și altă comandă?' / 'ce e pe drum?'.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'accept_order',
    description:
      "WRITE: assigns an unassigned (CREATED/OFFERED) order to this courier and moves it to ACCEPTED. ONLY call when the courier's current message explicitly asks to accept a specific order BY short id. If the order is already taken, in a wrong state, or violates the courier's max_parallel_orders, the tool returns an error and you should report it back.",
    input_schema: {
      type: 'object',
      properties: {
        short_id_8: {
          type: 'string',
          description: 'The 8-character short id prefix shown in tool results (e.g. "a3f2b1c0").',
          minLength: 6,
          maxLength: 12,
        },
      },
      required: ['short_id_8'],
    },
  },
];

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type Message = {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
};

// ─── Tool executors ─────────────────────────────────────────────────────

async function execGetMyActiveOrders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from('courier_orders')
    .select(
      'id, status, dropoff_line1, total_ron, delivery_fee_ron, source_tenant_id, updated_at',
    )
    .eq('assigned_courier_user_id', userId)
    .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
    .order('updated_at', { ascending: true })
    .limit(20);

  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    dropoff_line1: string | null;
    total_ron: number | null;
    delivery_fee_ron: number | null;
  }>;
  if (rows.length === 0) {
    return JSON.stringify({ count: 0, orders: [] });
  }

  return JSON.stringify({
    count: rows.length,
    orders: rows.map((r) => ({
      short_id: r.id.slice(0, 8),
      status: r.status,
      dropoff: r.dropoff_line1 ?? 'adresă necunoscută',
      total_ron: Number(r.total_ron ?? 0),
      delivery_fee_ron: Number(r.delivery_fee_ron ?? 0),
    })),
  });
}

async function execGetMyEarningsSummary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
): Promise<string> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dow = startOfToday.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - offset);

  const fetchSum = async (since: Date) => {
    const { data } = await admin
      .from('courier_orders')
      .select('delivery_fee_ron')
      .eq('assigned_courier_user_id', userId)
      .eq('status', 'DELIVERED')
      .gte('updated_at', since.toISOString());
    const rows = (data ?? []) as Array<{ delivery_fee_ron: number | null }>;
    return rows.reduce((acc, r) => acc + Number(r.delivery_fee_ron ?? 0), 0);
  };

  const [todayRon, weekRon] = await Promise.all([
    fetchSum(startOfToday),
    fetchSum(startOfWeek),
  ]);

  const { count: todayCount } = await admin
    .from('courier_orders')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_courier_user_id', userId)
    .eq('status', 'DELIVERED')
    .gte('updated_at', startOfToday.toISOString());

  return JSON.stringify({
    today_ron: Number(todayRon.toFixed(2)),
    today_deliveries: todayCount ?? 0,
    week_ron: Number(weekRon.toFixed(2)),
    avg_per_delivery_today:
      todayCount && todayCount > 0
        ? Number((todayRon / todayCount).toFixed(2))
        : null,
  });
}

async function execGetAvailableOrdersNearby(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
): Promise<string> {
  // Resolve courier fleet_id.
  const { data: profile } = await admin
    .from('courier_profiles')
    .select('fleet_id')
    .eq('user_id', userId)
    .maybeSingle();
  const fleetId = (profile as { fleet_id: string | null } | null)?.fleet_id ?? null;

  let query = admin
    .from('courier_orders')
    .select('id, status, pickup_line1, dropoff_line1, total_ron, delivery_fee_ron')
    .is('assigned_courier_user_id', null)
    .in('status', ['CREATED', 'OFFERED'])
    .order('created_at', { ascending: true })
    .limit(5);

  if (fleetId) {
    query = query.eq('fleet_id', fleetId);
  }

  const { data } = await query;
  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    pickup_line1: string | null;
    dropoff_line1: string | null;
    total_ron: number | null;
    delivery_fee_ron: number | null;
  }>;

  if (rows.length === 0) {
    return JSON.stringify({ count: 0, available: [], fleet_id: fleetId });
  }
  return JSON.stringify({
    count: rows.length,
    fleet_id: fleetId,
    available: rows.map((r) => ({
      short_id: r.id.slice(0, 8),
      pickup: r.pickup_line1 ?? '—',
      dropoff: r.dropoff_line1 ?? '—',
      total_ron: Number(r.total_ron ?? 0),
      delivery_fee_ron: Number(r.delivery_fee_ron ?? 0),
    })),
  });
}

// Haversine distance in km between two (lat,lng) coords.
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

async function execSuggestPickupOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
): Promise<string> {
  // Last known position from the active shift.
  const { data: shift } = await admin
    .from('courier_shifts')
    .select('last_lat, last_lng, last_seen_at')
    .eq('courier_user_id', userId)
    .eq('status', 'ONLINE')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const start =
    shift?.last_lat != null && shift?.last_lng != null
      ? { lat: Number(shift.last_lat), lng: Number(shift.last_lng) }
      : null;

  const { data: orders } = await admin
    .from('courier_orders')
    .select(
      'id, status, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_line1, dropoff_line1',
    )
    .eq('assigned_courier_user_id', userId)
    .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
    .limit(20);

  type Stop = {
    short_id: string;
    kind: 'pickup' | 'dropoff';
    label: string;
    lat: number;
    lng: number;
  };

  const stops: Stop[] = [];
  for (const o of (orders ?? []) as Array<{
    id: string;
    status: string;
    pickup_lat: number | null;
    pickup_lng: number | null;
    dropoff_lat: number | null;
    dropoff_lng: number | null;
    pickup_line1: string | null;
    dropoff_line1: string | null;
  }>) {
    // Only include pickup if the order hasn't been picked up yet.
    if (
      o.status === 'ACCEPTED' &&
      o.pickup_lat != null &&
      o.pickup_lng != null
    ) {
      stops.push({
        short_id: o.id.slice(0, 8),
        kind: 'pickup',
        label: o.pickup_line1 ?? 'pickup',
        lat: Number(o.pickup_lat),
        lng: Number(o.pickup_lng),
      });
    }
    if (o.dropoff_lat != null && o.dropoff_lng != null) {
      stops.push({
        short_id: o.id.slice(0, 8),
        kind: 'dropoff',
        label: o.dropoff_line1 ?? 'dropoff',
        lat: Number(o.dropoff_lat),
        lng: Number(o.dropoff_lng),
      });
    }
  }

  if (stops.length === 0) {
    return JSON.stringify({
      count: 0,
      from: start ? 'last_gps' : 'no_gps',
      sequence: [],
      note: 'Nu ai opriri active cu coordonate disponibile.',
    });
  }

  // Greedy nearest-neighbor from start (or from the first stop if no GPS).
  const seq: Array<Stop & { distance_km: number }> = [];
  const remaining = [...stops];
  let cursor: { lat: number; lng: number } | null = start ?? null;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = cursor ? haversineKm(cursor, remaining[0]) : 0;
    for (let i = 1; i < remaining.length; i += 1) {
      const d = cursor ? haversineKm(cursor, remaining[i]) : 0;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    seq.push({ ...next, distance_km: Number(bestDist.toFixed(2)) });
    cursor = { lat: next.lat, lng: next.lng };
  }

  const totalKm = seq.reduce((a, b) => a + b.distance_km, 0);
  return JSON.stringify({
    count: seq.length,
    from: start ? 'last_gps' : 'first_stop',
    total_km: Number(totalKm.toFixed(2)),
    sequence: seq.map((s, i) => ({
      step: i + 1,
      short_id: s.short_id,
      kind: s.kind,
      label: s.label,
      distance_from_prev_km: s.distance_km,
    })),
  });
}

async function execFindComboCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
): Promise<string> {
  // Pull active orders to anchor on their pickup + dropoff coords.
  const { data: mine } = await admin
    .from('courier_orders')
    .select('id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng')
    .eq('assigned_courier_user_id', userId)
    .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
    .limit(20);

  const anchors: Array<{ lat: number; lng: number; kind: string; short_id: string }> = [];
  for (const o of (mine ?? []) as Array<{
    id: string;
    pickup_lat: number | null;
    pickup_lng: number | null;
    dropoff_lat: number | null;
    dropoff_lng: number | null;
  }>) {
    if (o.pickup_lat != null && o.pickup_lng != null) {
      anchors.push({
        lat: Number(o.pickup_lat),
        lng: Number(o.pickup_lng),
        kind: 'pickup',
        short_id: o.id.slice(0, 8),
      });
    }
    if (o.dropoff_lat != null && o.dropoff_lng != null) {
      anchors.push({
        lat: Number(o.dropoff_lat),
        lng: Number(o.dropoff_lng),
        kind: 'dropoff',
        short_id: o.id.slice(0, 8),
      });
    }
  }

  if (anchors.length === 0) {
    return JSON.stringify({
      count: 0,
      reason: 'no_active_orders_with_coords',
      candidates: [],
    });
  }

  // Resolve fleet for the candidate filter.
  const { data: profile } = await admin
    .from('courier_profiles')
    .select('fleet_id')
    .eq('user_id', userId)
    .maybeSingle();
  const fleetId = (profile as { fleet_id: string | null } | null)?.fleet_id ?? null;

  let q = admin
    .from('courier_orders')
    .select(
      'id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_line1, dropoff_line1, total_ron, delivery_fee_ron',
    )
    .is('assigned_courier_user_id', null)
    .in('status', ['CREATED', 'OFFERED'])
    .limit(40);
  if (fleetId) q = q.eq('fleet_id', fleetId);

  const { data: available } = await q;
  const RADIUS_KM = 1.2;
  type Candidate = {
    short_id: string;
    pickup: string;
    dropoff: string;
    total_ron: number;
    delivery_fee_ron: number;
    nearest_anchor_km: number;
    nearest_anchor: string;
  };
  const candidates: Candidate[] = [];

  for (const c of (available ?? []) as Array<{
    id: string;
    pickup_lat: number | null;
    pickup_lng: number | null;
    dropoff_lat: number | null;
    dropoff_lng: number | null;
    pickup_line1: string | null;
    dropoff_line1: string | null;
    total_ron: number | null;
    delivery_fee_ron: number | null;
  }>) {
    let bestDist = Infinity;
    let bestAnchor = '';
    const points = [
      c.pickup_lat != null && c.pickup_lng != null
        ? { lat: Number(c.pickup_lat), lng: Number(c.pickup_lng), kind: 'pickup' }
        : null,
      c.dropoff_lat != null && c.dropoff_lng != null
        ? { lat: Number(c.dropoff_lat), lng: Number(c.dropoff_lng), kind: 'dropoff' }
        : null,
    ].filter((p): p is { lat: number; lng: number; kind: string } => p !== null);
    if (points.length === 0) continue;

    for (const p of points) {
      for (const a of anchors) {
        const d = haversineKm(a, p);
        if (d < bestDist) {
          bestDist = d;
          bestAnchor = `${p.kind}↔${a.kind} of #${a.short_id}`;
        }
      }
    }

    if (bestDist <= RADIUS_KM) {
      candidates.push({
        short_id: c.id.slice(0, 8),
        pickup: c.pickup_line1 ?? '—',
        dropoff: c.dropoff_line1 ?? '—',
        total_ron: Number(c.total_ron ?? 0),
        delivery_fee_ron: Number(c.delivery_fee_ron ?? 0),
        nearest_anchor_km: Number(bestDist.toFixed(2)),
        nearest_anchor: bestAnchor,
      });
    }
  }

  candidates.sort((a, b) => a.nearest_anchor_km - b.nearest_anchor_km);
  return JSON.stringify({
    count: Math.min(5, candidates.length),
    radius_km: RADIUS_KM,
    anchor_count: anchors.length,
    candidates: candidates.slice(0, 5),
  });
}

async function execAcceptOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  input: Record<string, unknown>,
  userPromptText: string,
): Promise<string> {
  const shortId = String(input.short_id_8 ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{6,12}$/.test(shortId)) {
    return JSON.stringify({ error: 'invalid_short_id' });
  }

  // Trust gate: the courier's current user prompt must include the short id
  // AND a clear accept verb. This protects against an LLM mis-firing the
  // write tool when the courier was only asking what's nearby.
  const promptLower = userPromptText.toLowerCase();
  const hasShortId = promptLower.includes(shortId);
  const ACCEPT_RE = /(accept|iau|ia[\s-]*o|ok\s*ia)/i;
  if (!hasShortId || !ACCEPT_RE.test(promptLower)) {
    return JSON.stringify({
      error: 'consent_required',
      note: 'Courierul nu a confirmat explicit acceptarea acestei comenzi. Cere-i să spună "accept #' + shortId + '" pentru a continua.',
    });
  }

  // Resolve courier profile (fleet + parallel limit).
  const { data: profile } = await admin
    .from('courier_profiles')
    .select('fleet_id, max_parallel_orders')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile) return JSON.stringify({ error: 'profile_not_found' });
  const profileRow = profile as { fleet_id: string | null; max_parallel_orders: number | null };

  if (profileRow.max_parallel_orders != null) {
    const { count } = await admin
      .from('courier_orders')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_courier_user_id', userId)
      .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);
    if ((count ?? 0) >= profileRow.max_parallel_orders) {
      return JSON.stringify({ error: 'limit_reached', max: profileRow.max_parallel_orders });
    }
  }

  // Find unique unassigned order whose id startsWith shortId.
  // Postgres LIKE on uuid::text since uuid does not natively support startsWith.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let candQuery: any = admin
    .from('courier_orders')
    .select('id, fleet_id, status')
    .ilike('id', shortId + '%')
    .in('status', ['CREATED', 'OFFERED'])
    .is('assigned_courier_user_id', null)
    .limit(2);
  if (profileRow.fleet_id) candQuery = candQuery.eq('fleet_id', profileRow.fleet_id);

  const { data: candidates } = await candQuery;
  const cands = (candidates ?? []) as Array<{ id: string; fleet_id: string | null }>;
  if (cands.length === 0) return JSON.stringify({ error: 'not_found_or_taken' });
  if (cands.length > 1) return JSON.stringify({ error: 'ambiguous_short_id' });

  const target = cands[0];

  // Atomic claim.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let claimQuery: any = admin
    .from('courier_orders')
    .update({
      status: 'ACCEPTED',
      assigned_courier_user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id)
    .in('status', ['CREATED', 'OFFERED'])
    .is('assigned_courier_user_id', null);
  if (profileRow.fleet_id) claimQuery = claimQuery.eq('fleet_id', profileRow.fleet_id);

  const { data: claimed } = await claimQuery.select('id').maybeSingle();
  if (!claimed) return JSON.stringify({ error: 'already_taken' });

  // Mark any combo push audit row as accepted (best-effort, ROI tracking).
  await admin
    .from('courier_combo_pushes')
    .update({ accepted_order_id: target.id, accepted_at: new Date().toISOString() })
    .eq('courier_user_id', userId)
    .is('accepted_order_id', null)
    .gte('sent_at', new Date(Date.now() - 30 * 60_000).toISOString());

  return JSON.stringify({
    ok: true,
    short_id_8: shortId,
    order_id: target.id,
    new_status: 'ACCEPTED',
    note: 'Comanda a fost acceptată cu succes. Spune-i curierului pasul următor concret.',
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  input: Record<string, unknown>,
  userPromptText: string,
): Promise<string> {
  if (name === 'get_my_active_orders') return execGetMyActiveOrders(admin, userId);
  if (name === 'get_my_earnings_summary')
    return execGetMyEarningsSummary(admin, userId);
  if (name === 'get_available_orders_nearby')
    return execGetAvailableOrdersNearby(admin, userId);
  if (name === 'suggest_pickup_order') return execSuggestPickupOrder(admin, userId);
  if (name === 'find_combo_candidates') return execFindComboCandidates(admin, userId);
  if (name === 'accept_order') return execAcceptOrder(admin, userId, input, userPromptText);
  return JSON.stringify({ error: `unknown_tool: ${name}` });
}

// ─── POST handler ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
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
  const admin = createAdminClient() as any;

  const messages: Message[] = [
    ...history,
    { role: 'user', content: prompt },
  ];

  let model = MODEL;
  let totalIn = 0;
  let totalOut = 0;
  let errorText: string | null = null;
  let responseText = '';
  const toolsUsed: string[] = [];

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
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        }),
      });
      if (!res.ok) {
        errorText = `anthropic_${res.status}`;
        const detail = await res.text().catch(() => '');
        console.error('[hepi-curier] anthropic failed', res.status, detail);
        break;
      }

      const data = (await res.json()) as {
        content: ContentBlock[];
        model: string;
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      model = data.model ?? MODEL;
      totalIn += data.usage?.input_tokens ?? 0;
      totalOut += data.usage?.output_tokens ?? 0;

      // Capture assistant text in case this is the final turn.
      const textParts = data.content
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text);
      if (textParts.length > 0) responseText = textParts.join('\n').trim();

      if (data.stop_reason !== 'tool_use') {
        break;
      }

      // Execute tool_use blocks, append assistant + tool_result turn, loop.
      const toolUses = data.content.filter(
        (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
      );
      if (toolUses.length === 0) break;

      const toolResults: ContentBlock[] = [];
      for (const tu of toolUses) {
        toolsUsed.push(tu.name);
        const out = await execTool(tu.name, admin, user.id, tu.input ?? {}, prompt);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: out,
        });
      }

      messages.push({ role: 'assistant', content: data.content });
      messages.push({ role: 'user', content: toolResults });
    }
  } catch (e) {
    errorText = e instanceof Error ? e.message : 'unknown';
    console.error('[hepi-curier] threw', errorText);
  }

  const { data: runRow } = await admin
    .from('courier_agent_runs')
    .insert({
      courier_id: user.id,
      agent_name: 'hepi-curier',
      prompt,
      response: responseText || null,
      model,
      prompt_tokens: totalIn || null,
      response_tokens: totalOut || null,
      error: errorText,
    })
    .select('id')
    .single();

  if (errorText && !responseText) {
    return NextResponse.json(
      { error: 'ai_call_failed', detail: errorText, run_id: runRow?.id },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    response: responseText,
    run_id: runRow?.id,
    tools_used: toolsUsed,
  });
}
