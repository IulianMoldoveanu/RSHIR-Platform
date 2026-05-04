import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    app: 'restaurant-admin',
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown',
    env: process.env.VERCEL_ENV ?? 'local',
    region: process.env.VERCEL_REGION ?? 'unknown',
    deployedAt: process.env.BUILD_TIME ?? null,
    ts: new Date().toISOString(),
  });
}
