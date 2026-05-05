// Lane 9 — Edge Function observability helper.
//
// `withRunLog(name, fn, opts?)` wraps an async unit of work in a single
// platform-telemetry row in `public.function_runs`:
//   - INSERT on entry  → status RUNNING, started_at = now()
//   - UPDATE on exit   → status SUCCESS, ended_at + metadata merge
//   - UPDATE on throw  → status ERROR,   ended_at + error_text + metadata
//
// ADDITIVE ONLY. The wrap NEVER changes the function's response, latency
// budget, or error-propagation semantics:
//   - All log writes use a service-role Supabase client with persistSession
//     and autoRefreshToken disabled (cheap, no realtime subscription).
//   - Both the start-INSERT and the end-UPDATE are wrapped in try/catch and
//     swallowed — if Supabase is down we log to console.warn and let the
//     wrapped function continue. We do NOT want observability outages to
//     take down a webhook handler.
//   - On error, we re-throw so the function's existing error path still
//     fires (Sentry / 5xx response / Telegram alert / etc).
//
// Usage in an Edge Function (Deno):
//
//     import { withRunLog } from '../_shared/log.ts';
//
//     Deno.serve(async (req) => {
//       return withRunLog('my-function', async ({ setMetadata }) => {
//         // ... existing handler body ...
//         setMetadata({ tenant_id: t.id, items_processed: 17 });
//         return new Response(JSON.stringify({ ok: true }));
//       });
//     });
//
// `setMetadata` merges into the row's `metadata` jsonb on success/error.
// `tenant_id` (top-level column) is also pulled from metadata if set there.
//
// If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are absent (e.g. local
// preview without secrets), the wrap becomes a transparent passthrough —
// the function still runs, no row is written.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type WithRunLogContext = {
  /**
   * Merge fields into the run's `metadata` jsonb. Called any number of
   * times during the wrapped function. Last-write-wins per key. If you
   * include `tenant_id` (uuid string), it is also written to the
   * top-level `tenant_id` column on the row.
   */
  setMetadata: (patch: Record<string, Json>) => void;
  /** The id of the function_runs row, or null if logging is disabled. */
  runId: string | null;
};

type WithRunLogOpts = {
  /** Initial metadata payload (merged with any later setMetadata calls). */
  metadata?: Record<string, Json>;
  /** Optional initial tenant_id. */
  tenantId?: string;
};

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function withRunLog<T>(
  functionName: string,
  fn: (ctx: WithRunLogContext) => Promise<T>,
  opts: WithRunLogOpts = {},
): Promise<T> {
  const supabase = getServiceClient();
  let runId: string | null = null;
  const metadata: Record<string, Json> = { ...(opts.metadata ?? {}) };
  let tenantId: string | null = opts.tenantId ?? null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('function_runs')
        .insert({
          function_name: functionName,
          status: 'RUNNING',
          metadata,
          tenant_id: tenantId,
        })
        .select('id')
        .single();
      if (error) {
        console.warn(`[withRunLog] insert failed for ${functionName}:`, error.message);
      } else {
        runId = (data as { id: string } | null)?.id ?? null;
      }
    } catch (e) {
      console.warn(`[withRunLog] insert threw for ${functionName}:`, (e as Error).message);
    }
  }

  const setMetadata = (patch: Record<string, Json>) => {
    Object.assign(metadata, patch);
    if (typeof patch.tenant_id === 'string' && /^[0-9a-f-]{36}$/i.test(patch.tenant_id)) {
      tenantId = patch.tenant_id;
    }
  };

  const finish = async (status: 'SUCCESS' | 'ERROR', errorText: string | null) => {
    if (!supabase || !runId) return;
    try {
      const { error } = await supabase
        .from('function_runs')
        .update({
          status,
          ended_at: new Date().toISOString(),
          error_text: errorText,
          metadata,
          tenant_id: tenantId,
        })
        .eq('id', runId);
      if (error) {
        console.warn(`[withRunLog] update failed for ${functionName}:`, error.message);
      }
    } catch (e) {
      console.warn(`[withRunLog] update threw for ${functionName}:`, (e as Error).message);
    }
  };

  try {
    const result = await fn({ setMetadata, runId });
    await finish('SUCCESS', null);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish('ERROR', msg.slice(0, 2000));
    throw e;
  }
}
