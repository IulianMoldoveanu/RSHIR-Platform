import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      app: 'restaurant-admin',
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown',
      env: process.env.VERCEL_ENV ?? 'local',
      region: process.env.VERCEL_REGION ?? 'unknown',
      deployedAt: process.env.BUILD_TIME ?? null,
      ts: new Date().toISOString(),
    },
    {
      // Lane M: deploy-identity probe MUST NOT be cached. See restaurant-
      // web/api/version for the rationale — same shape across all 3 apps.
      headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
    },
  );
}
