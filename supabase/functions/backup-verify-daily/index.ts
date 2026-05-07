// Lane BACKUP-DR-AUDIT (2026-05-08) — daily backup verification.
//
// Once-per-day cron-driven sanity check on Supabase backups. Pings the
// Mgmt API:
//   GET https://api.supabase.com/v1/projects/{ref}/database/backups
// then alerts Iulian via Telegram when:
//   - org plan is 'free' AND no backups visible (intentional warning until Pro upgrade), OR
//   - org plan >= 'pro' AND most recent backup is older than 26h (genuine drift), OR
//   - the Mgmt API call itself fails for reasons other than transient 5xx.
//
// State-transition aware (uses backup_verify_state table) so we don't
// spam Telegram every day if the situation is unchanged. Logs to
// function_runs via withRunLog for observability + a clear paper trail.
//
// Triggered by pg_cron daily at 06:00 Europe/Bucharest (see migration
// 20260508_003_backup_verify_cron.sql when scheduled — deferred to
// Iulian sign-off so we don't spam Telegram on an unset secret).
//
// Env required:
//   SUPABASE_URL              (auto-injected)
//   SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//   SUPABASE_MGMT_PAT         (set manually by Iulian — see runbook §9)
//   SUPABASE_PROJECT_REF      (defaults to qfmeojeipncuxeltnvab)
//   SUPABASE_ORG_ID           (defaults to zhzvlbpsbpyyfaywhwjg)
//   TELEGRAM_BOT_TOKEN        (already set, shared with health-monitor)
//   TELEGRAM_IULIAN_CHAT_ID   (already set, shared with health-monitor)
//   BACKUP_VERIFY_TOKEN       (set manually — gates the public endpoint)

import { withRunLog } from '../_shared/log.ts';

const SUPABASE_MGMT_PAT = Deno.env.get('SUPABASE_MGMT_PAT') ?? '';
const SUPABASE_PROJECT_REF = Deno.env.get('SUPABASE_PROJECT_REF') ?? 'qfmeojeipncuxeltnvab';
const SUPABASE_ORG_ID = Deno.env.get('SUPABASE_ORG_ID') ?? 'zhzvlbpsbpyyfaywhwjg';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_CHAT_ID =
  Deno.env.get('TELEGRAM_IULIAN_CHAT_ID') ?? Deno.env.get('TELEGRAM_CHAT_ID') ?? '';
const BACKUP_VERIFY_TOKEN = Deno.env.get('BACKUP_VERIFY_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const STALE_THRESHOLD_HOURS = 26;
const MGMT_TIMEOUT_MS = 15_000;

type BackupRow = {
  inserted_at?: string;
  status?: string;
  is_physical_backup?: boolean;
};

type BackupApiResponse = {
  region?: string;
  pitr_enabled?: boolean;
  walg_enabled?: boolean;
  backups?: BackupRow[];
  physical_backup_data?: Record<string, unknown>;
};

type OrgApiResponse = {
  id?: string;
  name?: string;
  plan?: string;
};

type Verdict =
  | { kind: 'ok'; lastBackupAt: string; ageHours: number; plan: string }
  | { kind: 'free_no_backups'; plan: string }
  | { kind: 'stale'; lastBackupAt: string; ageHours: number; plan: string }
  | { kind: 'mgmt_api_error'; status: number | null; message: string }
  | { kind: 'no_pat' };

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOrgPlan(): Promise<string> {
  try {
    const r = await fetchWithTimeout(
      `https://api.supabase.com/v1/organizations/${SUPABASE_ORG_ID}`,
      { headers: { Authorization: `Bearer ${SUPABASE_MGMT_PAT}` } },
      MGMT_TIMEOUT_MS,
    );
    if (!r.ok) return 'unknown';
    const body = (await r.json()) as OrgApiResponse;
    return body.plan ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function fetchBackupState(): Promise<{ status: number; body: BackupApiResponse | null; error: string | null }> {
  try {
    const r = await fetchWithTimeout(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/backups`,
      { headers: { Authorization: `Bearer ${SUPABASE_MGMT_PAT}` } },
      MGMT_TIMEOUT_MS,
    );
    if (!r.ok) {
      return { status: r.status, body: null, error: `mgmt_api status=${r.status}` };
    }
    const body = (await r.json()) as BackupApiResponse;
    return { status: r.status, body, error: null };
  } catch (e) {
    return { status: 0, body: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function pickMostRecentBackup(rows: BackupRow[] | undefined): BackupRow | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows]
    .filter((r) => typeof r.inserted_at === 'string')
    .sort((a, b) => new Date(b.inserted_at!).getTime() - new Date(a.inserted_at!).getTime());
  return sorted[0] ?? null;
}

async function loadPriorState(): Promise<{ last_kind: string | null; last_alerted_at: string | null }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { last_kind: null, last_alerted_at: null };
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/backup_verify_state?select=last_kind,last_alerted_at&id=eq.singleton`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!r.ok) return { last_kind: null, last_alerted_at: null };
    const rows = (await r.json()) as Array<{ last_kind: string | null; last_alerted_at: string | null }>;
    return rows[0] ?? { last_kind: null, last_alerted_at: null };
  } catch {
    return { last_kind: null, last_alerted_at: null };
  }
}

async function persistState(verdict: Verdict, alerted: boolean): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const now = new Date().toISOString();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/backup_verify_state`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: 'singleton',
        last_kind: verdict.kind,
        last_checked_at: now,
        last_alerted_at: alerted ? now : null,
      }),
    });
  } catch {
    // best-effort
  }
}

async function tg(text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function formatVerdict(v: Verdict): string {
  switch (v.kind) {
    case 'ok':
      return `✅ <b>Backup OK</b>\nplan=<code>${v.plan}</code>\nlast_backup=<code>${v.lastBackupAt}</code>\nage=<b>${v.ageHours.toFixed(1)}h</b>`;
    case 'free_no_backups':
      return `⚠️ <b>BACKUP — free tier</b>\nplan=<code>${v.plan}</code>\nNo backups visible via Mgmt API. Free-tier internals only — restore via Supabase support ticket (24-72h).\nUpgrade to Pro before 10+ paying tenants. See <code>docs/runbooks/BACKUP_DR_RUNBOOK.md §1</code>.`;
    case 'stale':
      return `🔴 <b>BACKUP STALE</b>\nplan=<code>${v.plan}</code>\nlast_backup=<code>${v.lastBackupAt}</code>\nage=<b>${v.ageHours.toFixed(1)}h</b> (threshold ${STALE_THRESHOLD_HOURS}h)\nRunbook: <code>docs/runbooks/BACKUP_DR_RUNBOOK.md §2.1</code>.`;
    case 'mgmt_api_error':
      return `🔴 <b>BACKUP CHECK FAILED</b>\nstatus=<code>${v.status ?? 'timeout'}</code>\n${v.message}\nRetrying tomorrow. If recurrent, rotate SUPABASE_MGMT_PAT.`;
    case 'no_pat':
      return `⚠️ <b>BACKUP CHECK NO-OP</b>\nSUPABASE_MGMT_PAT secret not set on the function. See runbook §9 step 2.`;
  }
}

Deno.serve(async (req) => {
  // Token gate: cron-only invocation. Skip withRunLog on auth-rejected
  // requests to avoid polluting function_runs with unauthorized noise.
  const auth = req.headers.get('x-backup-verify-token') ?? '';
  if (!BACKUP_VERIFY_TOKEN || auth !== BACKUP_VERIFY_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }

  return withRunLog('backup-verify-daily', async ({ setMetadata }) => {
    let verdict: Verdict;

    if (!SUPABASE_MGMT_PAT) {
      verdict = { kind: 'no_pat' };
    } else {
      const [plan, backupRes] = await Promise.all([fetchOrgPlan(), fetchBackupState()]);

      if (backupRes.error) {
        // Treat 5xx (transient) the same as the rest — alert. The cron
        // runs daily; a single 5xx will resolve next run.
        verdict = { kind: 'mgmt_api_error', status: backupRes.status || null, message: backupRes.error };
      } else {
        const newest = pickMostRecentBackup(backupRes.body?.backups);
        const isFree = plan === 'free';

        if (!newest) {
          // No backup rows visible. On free tier this is expected
          // (Supabase keeps free-tier backups internally and doesn't
          // surface them via API). On pro+ this is genuine drift.
          verdict = isFree
            ? { kind: 'free_no_backups', plan }
            : {
                kind: 'mgmt_api_error',
                status: backupRes.status,
                message: `pro/team plan but no backups visible — investigate`,
              };
        } else {
          const insertedAt = newest.inserted_at!;
          const ageHours = (Date.now() - new Date(insertedAt).getTime()) / 3_600_000;
          if (ageHours > STALE_THRESHOLD_HOURS) {
            verdict = { kind: 'stale', lastBackupAt: insertedAt, ageHours, plan };
          } else {
            verdict = { kind: 'ok', lastBackupAt: insertedAt, ageHours, plan };
          }
        }
      }
    }

    setMetadata({
      verdict_kind: verdict.kind,
      ...(verdict.kind === 'ok'
        ? { plan: verdict.plan, age_hours: Number(verdict.ageHours.toFixed(2)) }
        : {}),
      ...(verdict.kind === 'stale'
        ? { plan: verdict.plan, age_hours: Number(verdict.ageHours.toFixed(2)) }
        : {}),
      ...(verdict.kind === 'free_no_backups' ? { plan: verdict.plan } : {}),
      ...(verdict.kind === 'mgmt_api_error' ? { http_status: verdict.status } : {}),
    });

    // Alert policy:
    //   - 'ok' never alerts (transition 'recovery' is logged + telegrammed once).
    //   - 'free_no_backups' alerts AT MOST once per 7 days (gentle reminder).
    //   - 'stale' alerts daily until resolved.
    //   - 'mgmt_api_error' alerts daily until resolved.
    //   - 'no_pat' alerts once, then suppressed.
    const prior = await loadPriorState();
    const wasOk = prior.last_kind === 'ok' || prior.last_kind === null;
    const lastAlertedAgo =
      prior.last_alerted_at !== null
        ? (Date.now() - new Date(prior.last_alerted_at).getTime()) / 3_600_000
        : Infinity;

    let shouldAlert = false;
    if (verdict.kind === 'ok' && !wasOk) {
      shouldAlert = true; // recovery
    } else if (verdict.kind === 'free_no_backups' && lastAlertedAgo > 24 * 7) {
      shouldAlert = true;
    } else if (verdict.kind === 'stale') {
      shouldAlert = true;
    } else if (verdict.kind === 'mgmt_api_error') {
      shouldAlert = true;
    } else if (verdict.kind === 'no_pat' && prior.last_kind !== 'no_pat') {
      shouldAlert = true;
    }

    let alerted = false;
    if (shouldAlert) {
      const prefix =
        verdict.kind === 'ok' && !wasOk
          ? '🟢 <b>BACKUP RECOVERED</b>\n'
          : '';
      alerted = await tg(prefix + formatVerdict(verdict));
    }

    await persistState(verdict, alerted);

    const httpStatus = verdict.kind === 'mgmt_api_error' ? 200 : 200;
    return new Response(
      JSON.stringify({
        ok: verdict.kind === 'ok' || verdict.kind === 'free_no_backups',
        kind: verdict.kind,
        alerted,
        ts: new Date().toISOString(),
      }),
      { status: httpStatus, headers: { 'Content-Type': 'application/json' } },
    );
  });
});
