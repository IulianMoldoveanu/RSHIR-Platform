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

You have access to three tools that read the courier's own data:
- get_my_active_orders   → list of currently assigned orders (ACCEPTED/PICKED_UP/IN_TRANSIT)
- get_my_earnings_summary → today + this-week earnings totals
- get_available_orders_nearby → CREATED/OFFERED orders in their fleet

Use tools when the question is about THIS COURIER's data ("ce comenzi am acum?",
"cât am câștigat?", "ce e disponibil?"). For general advice (route theory,
how to handle a complaint, etc.) answer directly without tools.

Style:
- Short. 2-3 short paragraphs max unless asked for detail.
- Direct tone, no jargon. Mention concrete numbers from tools when available.
- If a tool returns 0 rows, say so plainly ("Nu ai comenzi active acum").
- Suggest one concrete next step, not a list of generic tips.

You CANNOT modify any data. You cannot accept/cancel orders, change shift
status, or trigger payouts. The courier does those in-app.

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execTool(name: string, admin: any, userId: string): Promise<string> {
  if (name === 'get_my_active_orders') return execGetMyActiveOrders(admin, userId);
  if (name === 'get_my_earnings_summary')
    return execGetMyEarningsSummary(admin, userId);
  if (name === 'get_available_orders_nearby')
    return execGetAvailableOrdersNearby(admin, userId);
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
        const out = await execTool(tu.name, admin, user.id);
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
