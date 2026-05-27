// Lane HIRforYOU-MARKETPLACE (2026-05-28) — refresh the marketplace
// directory materialized view.
//
// Runs nightly at 02:00 UTC via pg_cron (see migration
// 20260629_002_marketplace_directory_cron.sql, followup PR).
//
// Reads no secrets beyond the auto-injected service-role key. The
// `refresh_marketplace_directory()` SQL function is SECURITY DEFINER and
// the only thing this function calls.
//
// Required env (auto-injected by Supabase Edge runtime):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   HIR_NOTIFY_SECRET — when set, callers must pass x-hir-notify-secret.
//                       cron-job.org / pg_cron pass this; HTTP-callers from
//                       outside trusted infra are rejected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(405, { error: 'method_not_allowed' });
  }

  const expectedSecret = Deno.env.get('HIR_NOTIFY_SECRET');
  if (expectedSecret) {
    const got = req.headers.get('x-hir-notify-secret');
    if (got !== expectedSecret) {
      return json(401, { error: 'unauthorized' });
    }
  }

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    return json(500, { error: 'env_missing' });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = Date.now();
  const { error } = await supabase.rpc('refresh_marketplace_directory');
  if (error) {
    console.error('[marketplace-directory-refresh] rpc failed', error.message);
    return json(500, { error: 'refresh_failed', message: error.message });
  }
  const elapsedMs = Date.now() - startedAt;
  return json(200, { ok: true, elapsed_ms: elapsedMs });
});
