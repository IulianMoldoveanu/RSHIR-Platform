// Lane S — manual audit chain verifier endpoint.
//
// POST /api/admin/audit/verify
// Body: { range_start?: ISO|null, range_end?: ISO|null }
// Auth: platform_admin only (via HIR_PLATFORM_ADMIN_EMAILS allow-list).
//
// Effect:
//   1. Records a row in audit_log_verifier_runs.
//   2. Calls audit_log_verify_chain(p_start, p_end).
//   3. For each mismatch, fires a Telegram alert via the audit-integrity-alert edge fn.
//   4. Returns { ok, run_id, mismatch_count, mismatches[] }.
//
// NOTHING here mutates the audit_log itself. Read-only relative to the audit data.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSameOrigin } from '@/lib/origin-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  range_start: z.string().datetime().nullable().optional(),
  range_end: z.string().datetime().nullable().optional(),
});

type Mismatch = {
  row_id: string;
  created_at: string;
  expected_hash: string;
  stored_hash: string;
  prev_hash: string | null;
};

async function isPlatformAdmin(): Promise<{ ok: true; email: string } | { ok: false; status: number }> {
  const supa = createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) return { ok: false, status: 401 };
  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.includes(user.email.toLowerCase())) return { ok: false, status: 403 };
  return { ok: true, email: user.email };
}

export async function POST(req: NextRequest) {
  // CSRF defense: cookie-authed PLATFORM_ADMIN endpoint — refuse cross-origin
  // POSTs even if the operator is logged in. assertSameOrigin matches the
  // existing pattern in /api/zones, /api/domains, etc.
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json(
      { error: 'forbidden_origin', reason: origin.reason },
      { status: 403 },
    );
  }

  const auth = await isPlatformAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.status });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', details: parsed.error.flatten() }, { status: 400 });
  }

  const rangeStart = parsed.data.range_start ?? null;
  const rangeEnd = parsed.data.range_end ?? null;

  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Mismatch[] | null; error: { message: string } | null }>;
  };

  // 1. Open run row.
  const runIns = await admin
    .from('audit_log_verifier_runs')
    .insert({
      range_start: rangeStart,
      range_end: rangeEnd,
      triggered_by: auth.email,
    })
    .select('id')
    .single();
  if (runIns.error || !runIns.data) {
    return NextResponse.json({ error: 'run_insert_failed', detail: runIns.error?.message }, { status: 500 });
  }
  const runId = runIns.data.id;

  // 2. Run verifier RPC.
  const rpc = await admin.rpc('audit_log_verify_chain', {
    p_start: rangeStart,
    p_end: rangeEnd,
  });
  if (rpc.error) {
    await admin
      .from('audit_log_verifier_runs')
      .update({ finished_at: new Date().toISOString(), mismatches: -1 })
      .eq('id', runId);
    return NextResponse.json({ error: 'verifier_failed', detail: rpc.error.message }, { status: 500 });
  }

  const mismatches: Mismatch[] = rpc.data ?? [];

  // 3. Fire Telegram alert per mismatch (best-effort; do not fail the API).
  if (mismatches.length > 0) {
    const alertUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/audit-integrity-alert`;
    const alertToken = process.env.AUDIT_INTEGRITY_ALERT_TOKEN;
    if (alertToken) {
      await Promise.all(
        mismatches.map((m) =>
          fetch(alertUrl, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${alertToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              row_id: m.row_id,
              expected_hash: m.expected_hash,
              stored_hash: m.stored_hash,
              verifier_run_id: runId,
              range_start: rangeStart,
              range_end: rangeEnd,
            }),
          }).catch((e) => {
            console.error('[audit-verify] alert dispatch failed', e);
          }),
        ),
      );
    } else {
      console.warn('[audit-verify] AUDIT_INTEGRITY_ALERT_TOKEN not set — skipping Telegram dispatch');
    }
  }

  // 4. Close run row.
  await admin
    .from('audit_log_verifier_runs')
    .update({
      finished_at: new Date().toISOString(),
      mismatches: mismatches.length,
    })
    .eq('id', runId);

  return NextResponse.json({
    ok: true,
    run_id: runId,
    mismatch_count: mismatches.length,
    mismatches,
  });
}
