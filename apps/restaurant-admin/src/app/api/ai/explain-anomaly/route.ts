import { NextResponse } from 'next/server';
import { getActiveTenant, assertTenantMember } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/ai/explain-anomaly
//
// Server-side proxy for the `analytics-explain-anomaly` Edge Function.
// The button on /dashboard KPI cards posts here; we authenticate the
// session, resolve the active tenant, then forward the call to the Edge
// Function with the shared `HIR_NOTIFY_SECRET` header. Output is the
// dispatcher's `data` payload (hypotheses[]) with a 200 envelope.
//
// Why a proxy: the Edge Function uses the service-role key + `dispatchIntent`
// + per-day cap counted from `copilot_agent_runs`. We never want the
// browser to call the Edge Function directly because the shared secret
// would have to ship in the bundle.

type ExplainBody = {
  metric?: string;
  dateRange?: string;
};

export async function POST(req: Request): Promise<NextResponse> {
  // 1. AuthN + active tenant.
  let tenantId: string;
  let userId: string;
  try {
    const ctx = await getActiveTenant();
    tenantId = ctx.tenant.id;
    userId = ctx.user.id;
  } catch (e) {
    return NextResponse.json(
      { error: 'unauthenticated', message: e instanceof Error ? e.message : String(e) },
      { status: 401 },
    );
  }
  // 2. Membership guard (defence in depth — getActiveTenant already filters).
  try {
    await assertTenantMember(userId, tenantId);
  } catch (e) {
    return NextResponse.json(
      { error: 'forbidden', message: e instanceof Error ? e.message : String(e) },
      { status: 403 },
    );
  }

  // 3. Parse body.
  let body: ExplainBody;
  try {
    body = (await req.json()) as ExplainBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const metric = String(body.metric ?? 'orders').toLowerCase();
  if (metric !== 'orders' && metric !== 'revenue' && metric !== 'aov') {
    return NextResponse.json({ error: 'invalid_metric' }, { status: 400 });
  }
  const dateRange = String(body.dateRange ?? 'today').toLowerCase();
  if (dateRange !== 'today' && dateRange !== 'week') {
    return NextResponse.json({ error: 'invalid_dateRange' }, { status: 400 });
  }

  // 4. Forward to Edge Function.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const notifySecret = process.env.HIR_NOTIFY_SECRET;
  if (!supabaseUrl || !notifySecret) {
    return NextResponse.json(
      { error: 'server_misconfigured', missing: !supabaseUrl ? 'SUPABASE_URL' : 'HIR_NOTIFY_SECRET' },
      { status: 500 },
    );
  }
  const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/analytics-explain-anomaly`;
  let res: Response;
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hir-notify-secret': notifySecret,
      },
      body: JSON.stringify({ tenantId, metric, dateRange }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'edge_fn_unreachable', message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return NextResponse.json(
      { error: 'edge_fn_failed', status: res.status, body: payload },
      { status: 502 },
    );
  }
  return NextResponse.json(payload);
}
