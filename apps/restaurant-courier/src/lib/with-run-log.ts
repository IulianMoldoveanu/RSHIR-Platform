// Lightweight bookkeeping wrapper for courier server actions.
//
// Mirrors the `withRunLog` helper used by Edge Functions (admin observability
// dashboard at /dashboard/admin/observability/function-runs), but tailored
// for Next.js server actions: no HTTP envelope, no JWT context, no streaming
// — just record start, run, then record end + status + duration into
// `public.function_runs`. Errors are RETHROWN (the courier still needs the
// real exception to bubble up to the boundary), but the run row gets a
// status='error' + error_text snapshot.
//
// Failures of the run-log itself are swallowed — observability must never
// block the user action.
//
// Why direct-insert and not call into an Edge Function:
//   - One extra HTTP hop per state transition is unacceptable for a swipe
//     gesture on mobile data. The service-role insert below is in-process.
//   - The Edge Function helper is Deno-only and not importable from Next.
//
// Caller convention:
//   const result = await withRunLog(
//     'courier.markPickedUp',
//     { courier_user_id: userId, order_id: orderId },
//     async () => doTheActualWork(),
//   );

import { createAdminClient } from './supabase/admin';

type Metadata = Record<string, unknown>;

export async function withRunLog<T>(
  functionName: string,
  metadata: Metadata,
  body: () => Promise<T>,
): Promise<T> {
  const admin = createAdminClient();
  const startedAt = new Date();
  const t0 = Date.now();

  // Best-effort start insert — if it fails (e.g. RLS, network blip) we
  // continue silently. The user's action must not block on telemetry.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: created } = await sb
    .from('function_runs')
    .insert({
      function_name: functionName,
      started_at: startedAt.toISOString(),
      status: 'running',
      metadata,
    })
    .select('id')
    .maybeSingle();
  const runId =
    (created as { id: string } | null)?.id ?? null;

  try {
    const out = await body();
    const endedAt = new Date();
    if (runId) {
      await sb
        .from('function_runs')
        .update({
          ended_at: endedAt.toISOString(),
          duration_ms: Date.now() - t0,
          status: 'success',
        })
        .eq('id', runId);
    }
    return out;
  } catch (err) {
    const endedAt = new Date();
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'unknown error';
    if (runId) {
      // Truncate to a reasonable length so a stack trace doesn't bloat
      // the table; the full error still surfaces in the boundary + logs.
      await sb
        .from('function_runs')
        .update({
          ended_at: endedAt.toISOString(),
          duration_ms: Date.now() - t0,
          status: 'error',
          error_text: message.slice(0, 2000),
        })
        .eq('id', runId);
    }
    throw err;
  }
}
