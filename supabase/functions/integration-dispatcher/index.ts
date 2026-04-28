// RSHIR-53 — async dispatcher for integration_events.
//
// Triggered every 30s by the `integration-dispatcher-tick` pg_cron job
// (see supabase/migrations/20260501_003_integration_cron.sql). On each
// invocation it pulls up to 50 PENDING events whose scheduled_for has
// elapsed, dispatches them, and updates the row.
//
// MVP scope: Mock provider only. The Mock adapter has no external HTTP
// side-effect, so dispatching is just "mark SENT + audit-log". Real
// vendor adapters (iiko, Freya, smartcash, ...) ship in a future sprint;
// rows for those providers are marked DEAD with a clear error so they
// don't sit forever in the queue.
//
// Auth: shared-secret like notify-new-order / daily-digest / review-reminder.
//   HIR_NOTIFY_SECRET — required, sent by pg_net as `x-hir-notify-secret`.
//
// Auto-injected by Supabase runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30 * 1000; // 30s
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1h

type EventRow = {
  id: number;
  tenant_id: string;
  provider_key: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

type ProviderRow = {
  provider_key: string;
  config: Record<string, unknown>;
  webhook_secret: string;
  is_active: boolean;
};

function nextBackoffIso(nextAttempts: number): string {
  // Exponential: 30s * 2^attempts, capped at 1h. attempts is the
  // post-increment value (so first retry waits ~60s).
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** nextAttempts, MAX_BACKOFF_MS);
  return new Date(Date.now() + delay).toISOString();
}

async function loadProvider(
  supabase: SupabaseClient,
  tenantId: string,
  providerKey: string,
): Promise<ProviderRow | null> {
  const { data, error } = await supabase
    .from('integration_providers')
    .select('provider_key, config, webhook_secret, is_active')
    .eq('tenant_id', tenantId)
    .eq('provider_key', providerKey)
    .maybeSingle();
  if (error) {
    console.error('[integration-dispatcher] provider lookup error', error.message);
    return null;
  }
  return (data as ProviderRow | null) ?? null;
}

async function markSent(supabase: SupabaseClient, id: number): Promise<void> {
  const { error } = await supabase
    .from('integration_events')
    .update({ status: 'SENT', sent_at: new Date().toISOString(), last_error: null })
    .eq('id', id);
  if (error) console.error('[integration-dispatcher] markSent error', id, error.message);
}

async function markDead(
  supabase: SupabaseClient,
  id: number,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('integration_events')
    .update({ status: 'DEAD', last_error: reason })
    .eq('id', id);
  if (error) console.error('[integration-dispatcher] markDead error', id, error.message);
}

async function markRetry(
  supabase: SupabaseClient,
  row: EventRow,
  reason: string,
): Promise<'retry' | 'dead'> {
  const nextAttempts = row.attempts + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    await markDead(supabase, row.id, `max_attempts_exceeded: ${reason}`);
    return 'dead';
  }
  const { error } = await supabase
    .from('integration_events')
    .update({
      attempts: nextAttempts,
      last_error: reason,
      scheduled_for: nextBackoffIso(nextAttempts),
    })
    .eq('id', row.id);
  if (error) console.error('[integration-dispatcher] markRetry error', row.id, error.message);
  return 'retry';
}

async function auditDispatched(
  supabase: SupabaseClient,
  tenantId: string,
  row: EventRow,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    tenant_id: tenantId,
    actor_user_id: null,
    action: 'integration.dispatched',
    entity_type: 'integration_event',
    entity_id: String(row.id),
    metadata: {
      event_id: row.id,
      event_type: row.event_type,
      provider_key: row.provider_key,
    },
  });
  if (error) {
    console.error('[integration-dispatcher] audit insert error', row.id, error.message);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) {
    console.error('[integration-dispatcher] HIR_NOTIFY_SECRET not configured');
    return json(500, { error: 'secret_not_configured' });
  }
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return json(401, { error: 'unauthorized' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'supabase_env_missing' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();
  const { data: rows, error: pickErr } = await supabase
    .from('integration_events')
    .select('id, tenant_id, provider_key, event_type, payload, attempts')
    .eq('status', 'PENDING')
    .lte('scheduled_for', nowIso)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE);
  if (pickErr) {
    console.error('[integration-dispatcher] pick error', pickErr.message);
    return json(500, { error: 'pick_failed' });
  }

  const events = (rows ?? []) as EventRow[];
  let sent = 0;
  let failed = 0; // requeued for retry
  let dead = 0;

  for (const row of events) {
    const provider = await loadProvider(supabase, row.tenant_id, row.provider_key);
    if (!provider || !provider.is_active) {
      await markDead(supabase, row.id, 'provider_missing_or_inactive');
      dead += 1;
      continue;
    }

    if (provider.provider_key !== 'mock') {
      // Real adapter dispatching ships in a future sprint. Marking DEAD
      // (rather than retrying) avoids the row sitting in the queue forever
      // and surfaces the misconfiguration loudly in the audit/UI.
      await markDead(supabase, row.id, 'provider_not_implemented_in_dispatcher');
      dead += 1;
      continue;
    }

    // Mock adapter: always succeeds, no external call. We replicate its
    // behaviour inline here because the workspace package can't be
    // imported into the Deno Edge runtime.
    try {
      console.log('[integration-dispatcher] mock dispatch', {
        event_id: row.id,
        tenant_id: row.tenant_id,
        event_type: row.event_type,
      });
      await markSent(supabase, row.id);
      await auditDispatched(supabase, row.tenant_id, row);
      sent += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const outcome = await markRetry(supabase, row, msg);
      if (outcome === 'dead') dead += 1;
      else failed += 1;
    }
  }

  console.log(
    `[integration-dispatcher] processed=${events.length} sent=${sent} failed=${failed} dead=${dead}`,
  );
  return json(200, { processed: events.length, sent, failed, dead });
});
