import { NextResponse } from 'next/server';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { quoteRequestSchema } from '../schemas';
import { computeQuote } from '../pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await computeQuote(
    getSupabaseAdmin(),
    { id: tenant.id, slug: tenant.slug, settings: tenant.settings },
    parsed.data.items,
    parsed.data.address ?? null,
    parsed.data.fulfillment,
  );

  if (!result.ok) {
    return NextResponse.json({ error: 'quote_failed', reason: result.reason }, { status: 422 });
  }

  return NextResponse.json({ quote: result.quote });
}
