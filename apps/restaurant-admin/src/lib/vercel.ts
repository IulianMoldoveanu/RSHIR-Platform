// Thin wrapper around the Vercel Domains API. The restaurant-web Vercel
// project is on a paid plan that's still being provisioned, so prod usage
// is gated behind VERCEL_TOKEN + VERCEL_PROJECT_ID. When either is missing
// the API routes return `vercel_not_configured` and the column writes still
// happen so the UI is testable end-to-end against Supabase.

const API_BASE = 'https://api.vercel.com';

export type VercelConfig = {
  token: string;
  projectId: string;
  teamId?: string;
};

export type VercelStatus =
  | { kind: 'configured'; config: VercelConfig }
  | { kind: 'not_configured' };

export function readVercelConfig(): VercelStatus {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return { kind: 'not_configured' };
  return {
    kind: 'configured',
    config: { token, projectId, teamId: process.env.VERCEL_TEAM_ID || undefined },
  };
}

function withTeamQuery(cfg: VercelConfig, path: string): string {
  if (!cfg.teamId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}teamId=${encodeURIComponent(cfg.teamId)}`;
}

async function vercelFetch(
  cfg: VercelConfig,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(API_BASE + withTeamQuery(cfg, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

export type VercelDomainRecord = {
  name: string;
  verified: boolean;
  // when verified=false Vercel returns verification challenges
  verification?: Array<{ type: string; domain: string; value: string; reason: string }>;
  // SSL/config readiness
  misconfigured?: boolean;
  error?: { code: string; message: string };
};

export async function addProjectDomain(
  cfg: VercelConfig,
  domain: string,
): Promise<{ ok: true; record: VercelDomainRecord } | { ok: false; status: number; error: string }> {
  const r = await vercelFetch(cfg, `/v9/projects/${cfg.projectId}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: domain }),
  });
  if (!r.ok) return { ok: false, status: r.status, error: extractError(r.body) };
  return { ok: true, record: r.body as VercelDomainRecord };
}

export async function getProjectDomain(
  cfg: VercelConfig,
  domain: string,
): Promise<{ ok: true; record: VercelDomainRecord } | { ok: false; status: number; error: string }> {
  const r = await vercelFetch(
    cfg,
    `/v9/projects/${cfg.projectId}/domains/${encodeURIComponent(domain)}`,
  );
  if (!r.ok) return { ok: false, status: r.status, error: extractError(r.body) };
  return { ok: true, record: r.body as VercelDomainRecord };
}

export async function removeProjectDomain(
  cfg: VercelConfig,
  domain: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const r = await vercelFetch(
    cfg,
    `/v9/projects/${cfg.projectId}/domains/${encodeURIComponent(domain)}`,
    { method: 'DELETE' },
  );
  // 404 means the domain was already detached — treat as success.
  if (r.ok || r.status === 404) return { ok: true };
  return { ok: false, status: r.status, error: extractError(r.body) };
}

function extractError(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error: unknown }).error;
    if (e && typeof e === 'object' && 'message' in e) {
      return String((e as { message: unknown }).message);
    }
  }
  return 'Vercel API error';
}
