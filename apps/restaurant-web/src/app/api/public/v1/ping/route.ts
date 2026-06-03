// GET /api/public/v1/ping
// Lightweight authenticated whoami for public-API consumers. Used by the
// WordPress / WooCommerce plugin's "Test connection" button to confirm a
// key is valid and maps to the expected tenant. Any active key passes —
// no specific scope is required to verify itself.

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticateBearerKey } from '../auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authed = await authenticateBearerKey(req.headers.get('authorization'));
  if (!authed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Resolve the tenant slug so the client can show "Connected to <slug>".
  // tenants is in the generated types, but keep the same defensive cast
  // shape used elsewhere in the public API for consistency.
  const admin = getSupabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { slug: string; name: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const { data } = await admin
    .from('tenants')
    .select('slug, name')
    .eq('id', authed.tenantId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    tenant_id: authed.tenantId,
    tenant_slug: data?.slug ?? null,
    tenant_name: data?.name ?? null,
    scopes: authed.scopes,
  });
}
