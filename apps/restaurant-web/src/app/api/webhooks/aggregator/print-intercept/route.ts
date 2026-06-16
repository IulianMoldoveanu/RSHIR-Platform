// HIR Restaurant Suite — Print Intercept aggregator webhook intake.
//
// Receives parsed printout payloads from the HIR print-intercept
// companion (Android / Raspberry Pi). Default-off behind
// PRINT_INTERCEPT_ENABLED. HMAC-verified per per-restaurant secret.
//
// Tenant resolution (S8 hardening, 2026-06-16):
//   The producer (print companion) MUST send `X-HIR-Tenant: <tenant uuid>`
//   so we can look up the per-tenant HMAC secret BEFORE verifying the
//   signature. The secret lives in `tenants.settings.print_intercept.secret`
//   (Vault-encrypted at rest). This replaces the v1 single-shared
//   `PRINT_INTERCEPT_SECRET` env var, which is now only honoured outside
//   production as a dev-loop convenience.

import { NextResponse } from 'next/server';
import { printInterceptAdapter } from '@hir/integration-core';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Allow UUID v1-v8; tenant ids in this codebase are pg `uuid` so we accept
// any RFC-4122 shape. Validating shape before hitting the DB keeps a
// malformed header from turning into a wasted round-trip.
const TENANT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PrintInterceptTenantSettings = {
  print_intercept?: {
    secret?: string | null;
  } | null;
};

async function resolveTenantSecret(tenantId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (error || !data) return null;
  const settings = (data.settings ?? {}) as PrintInterceptTenantSettings;
  const secret = settings.print_intercept?.secret;
  return typeof secret === 'string' && secret.length >= 16 ? secret : null;
}

export async function POST(req: Request) {
  if (process.env.PRINT_INTERCEPT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'print_intercept_not_enabled' }, { status: 503 });
  }

  // Producer MUST send `X-HIR-Tenant: <tenant uuid>` (same header
  // convention used by external-dispatch — see
  // apps/restaurant-admin/src/lib/external-dispatch.ts). Without it we
  // cannot pick the right HMAC key and refuse the request.
  const tenantHeader = req.headers.get('x-hir-tenant')?.trim().toLowerCase() ?? '';
  if (!tenantHeader || !TENANT_ID_RE.test(tenantHeader)) {
    return NextResponse.json({ error: 'missing_or_invalid_tenant_header' }, { status: 400 });
  }

  let webhookSecret = await resolveTenantSecret(tenantHeader);
  // Dev-only fallback so local-loop testing without a configured tenant
  // row still works. In production a missing per-tenant secret means the
  // restaurant was never onboarded for print intercept → refuse.
  if (!webhookSecret && process.env.NODE_ENV !== 'production') {
    webhookSecret = process.env.PRINT_INTERCEPT_SECRET ?? null;
  }
  if (!webhookSecret) {
    return NextResponse.json({ error: 'print_intercept_secret_missing' }, { status: 503 });
  }

  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const event = await printInterceptAdapter.verifyWebhookWithSecret(
    {
      fetch,
      log: (level, msg, meta) => {
        console[level === 'error' ? 'error' : 'log'](
          `[webhooks/print-intercept] ${msg}`,
          meta ?? {},
        );
      },
    },
    raw,
    headers,
    { webhookSecret },
  );

  if (!event) {
    return NextResponse.json({ error: 'invalid_or_unparsable' }, { status: 400 });
  }

  // Cross-check that the envelope's claimed tenant matches the header we
  // verified against. Mismatch means the companion's local tenant config
  // drifted from what was provisioned — reject so we don't mirror an
  // event into the wrong restaurant's stream.
  if (
    typeof event.providerVenueId === 'string' &&
    event.providerVenueId.toLowerCase() !== tenantHeader
  ) {
    console.warn('[webhooks/print-intercept] tenant header / envelope mismatch', {
      headerTenant: tenantHeader,
      envelopeTenant: event.providerVenueId,
    });
    return NextResponse.json({ error: 'tenant_mismatch' }, { status: 400 });
  }

  console.log('[webhooks/print-intercept] received', {
    providerOrderId: event.providerOrderId,
    provider: event.source.type,
    items: event.items.length,
    tenantId: tenantHeader,
  });

  return NextResponse.json({ received: true });
}
