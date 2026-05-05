import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Companion to /api/healthz. Exposes deploy identity so smoke + uptime
// monitors can assert "the deploy I expected actually went out". Distinct
// from healthz because it's static (no DB) and cheap to call frequently.
export async function GET() {
  return NextResponse.json(
    {
      app: 'restaurant-web',
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown',
      env: process.env.VERCEL_ENV ?? 'local',
      region: process.env.VERCEL_REGION ?? 'unknown',
      deployedAt: process.env.BUILD_TIME ?? null,
      ts: new Date().toISOString(),
    },
    {
      // Lane M: deploy-identity probe MUST NOT be cached. The whole point
      // of /api/version is "did the deploy I expected actually go out" —
      // a cached response showing the old SHA defeats the assertion.
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    },
  );
}
