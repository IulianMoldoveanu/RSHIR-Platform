// Lane AI-EMPTY — detect "Anthropic credit exhausted / AI unavailable" by
// querying the Lane 9 `function_runs` ledger. We never call Anthropic just to
// check status — the ledger is the source of truth (every Edge Function that
// uses Anthropic is wrapped in `withRunLog` and writes a row on every run).
//
// Rule: if the most-recent run for a given function_name in the last 24h has
// status='ERROR' AND error_text matches a credit/quota signature, the AI
// surface backed by that function is treated as DEGRADED. Surfaces render a
// friendly empty-state instead of looping forever or showing a raw stack.
//
// ADDITIVE only — never throws into a page render path. On any failure
// (Supabase down, table missing, RLS blocks) we return `{ degraded: false }`
// and the page renders as if AI were healthy.
//
// Cached for 5 minutes via `unstable_cache` so a busy dashboard does not
// hammer `function_runs` on every render.

import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

// Substrings/patterns we consider "AI provider unavailable / credit-exhausted".
// Hits Anthropic's `credit balance is too low`, OpenAI-style `insufficient_quota`,
// and the wrapper's own `anthropic_4xx` envelope (400/401/402/403/429).
const CREDIT_SIGNATURE = /credit|balance\b|insufficient_quota|anthropic_4\d{2}|http_402|invalid_api_key|api[_ ]key/i;

export type AiFunctionStatus = {
  /** Edge function name as it appears in `function_runs.function_name`. */
  function_name: string;
  /** True iff the most recent run in 24h failed with a credit-style error. */
  degraded: boolean;
  /** ISO timestamp of the failing run, if any. */
  last_error_at: string | null;
  /** Truncated error text from `function_runs.error_text` (≤300 chars). */
  last_error_text: string | null;
};

export type AiAvailability = {
  /** True iff ANY tracked AI function is degraded. */
  anyDegraded: boolean;
  /** Per-function status map keyed by function_name. */
  byFunction: Record<string, AiFunctionStatus>;
};

// Functions whose health drives merchant-facing AI UI. Add here when wiring
// a new AI surface into the admin app.
const TRACKED_FUNCTIONS = [
  'copilot-daily-brief', // AI CEO daily brief + suggestions
  'growth-agent-daily',  // Growth Agent recommendations (Telegram-only today)
  'fix-attempt',         // Internal self-improvement (platform-admin diag only)
  'supervise-fix',       // Internal self-improvement (platform-admin diag only)
  'triage-feedback',     // Internal feedback triage (platform-admin diag only)
] as const;

type Row = {
  function_name: string;
  started_at: string;
  status: 'RUNNING' | 'SUCCESS' | 'ERROR';
  error_text: string | null;
};

async function fetchAiAvailabilityUncached(): Promise<AiAvailability> {
  const empty: AiAvailability = {
    anyDegraded: false,
    byFunction: Object.fromEntries(
      TRACKED_FUNCTIONS.map((n) => [
        n,
        { function_name: n, degraded: false, last_error_at: null, last_error_text: null },
      ]),
    ) as Record<string, AiFunctionStatus>,
  };

  let admin;
  try {
    admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          in: (
            c: string,
            vals: readonly string[],
          ) => {
            gte: (
              c: string,
              v: string,
            ) => {
              order: (
                c: string,
                opts: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{
                  data: Row[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  } catch (err) {
    console.warn('[ai-availability] admin client init failed:', (err as Error).message);
    return empty;
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let rows: Row[] = [];
  try {
    const res = await admin
      .from('function_runs')
      .select('function_name, started_at, status, error_text')
      .in('function_name', TRACKED_FUNCTIONS as unknown as readonly string[])
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(200);
    if (res.error) {
      console.warn('[ai-availability] query failed:', res.error.message);
      return empty;
    }
    rows = res.data ?? [];
  } catch (err) {
    console.warn('[ai-availability] query threw:', (err as Error).message);
    return empty;
  }

  // Walk newest-first and pick the FIRST terminal run per function (skipping
  // RUNNING rows that never finished — they shouldn't gate the UI).
  const seen = new Set<string>();
  const result: AiAvailability = {
    anyDegraded: false,
    byFunction: { ...empty.byFunction },
  };

  for (const r of rows) {
    if (seen.has(r.function_name)) continue;
    if (r.status === 'RUNNING') continue;
    seen.add(r.function_name);

    const isErr = r.status === 'ERROR';
    const matches = isErr && CREDIT_SIGNATURE.test(r.error_text ?? '');
    if (matches) {
      result.byFunction[r.function_name] = {
        function_name: r.function_name,
        degraded: true,
        last_error_at: r.started_at,
        last_error_text: (r.error_text ?? '').slice(0, 300),
      };
      result.anyDegraded = true;
    }
  }

  return result;
}

/**
 * Cached read on `function_runs` — 5-minute revalidate. Returns
 * `{ anyDegraded: false, … }` on any failure so callers can render
 * unconditionally without try/catch.
 */
export const getAiAvailability = unstable_cache(
  fetchAiAvailabilityUncached,
  ['ai-availability'],
  { revalidate: 300, tags: ['ai-availability'] },
);

/**
 * Convenience helper for surfaces that depend on a single function.
 */
export async function isAiFunctionDegraded(
  functionName: (typeof TRACKED_FUNCTIONS)[number],
): Promise<AiFunctionStatus> {
  const all = await getAiAvailability();
  return (
    all.byFunction[functionName] ?? {
      function_name: functionName,
      degraded: false,
      last_error_at: null,
      last_error_text: null,
    }
  );
}
