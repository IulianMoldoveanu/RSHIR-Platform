import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Companion to /api/healthz. Exposes deploy identity so smoke + uptime
// monitors can assert "the deploy I expected actually went out". Distinct
// from healthz because it's static (no DB) and cheap to call frequently.
export async function GET() {
  return NextResponse.json({
    app: 'restaurant-web',
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown',
    env: process.env.VERCEL_ENV ?? 'local',
    region: process.env.VERCEL_REGION ?? 'unknown',
    deployedAt: process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE ?? null,
    ts: new Date().toISOString(),
  });
}
