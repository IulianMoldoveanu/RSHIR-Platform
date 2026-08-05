import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { getCurrentCustomerId } from '@/lib/account/current-customer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  isDefault: z.literal(true),
});

async function assertOwnsAddress(
  admin: ReturnType<typeof getSupabaseAdmin>,
  addressId: string,
  customerId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('customer_addresses')
    .select('id')
    .eq('id', addressId)
    .eq('customer_id', customerId)
    .maybeSingle();
  return data !== null;
}

// PATCH — currently only supports {isDefault: true} (the "set as default"
// action). Unsetting default happens implicitly when another address is
// set default (idx_customer_addresses_one_default + the clear-then-insert
// pattern in POST /addresses, mirrored here).
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = assertSameOrigin(req);
  if (!origin.ok) return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const customerId = await getCurrentCustomerId(tenant.id);
  if (!customerId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!(await assertOwnsAddress(admin, params.id, customerId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await admin
    .from('customer_addresses')
    .update({ is_default: false } as never)
    .eq('customer_id', customerId)
    .eq('is_default', true);

  const { error } = await admin
    .from('customer_addresses')
    .update({ is_default: true } as never)
    .eq('id', params.id)
    .eq('customer_id', customerId);

  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = assertSameOrigin(req);
  if (!origin.ok) return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const customerId = await getCurrentCustomerId(tenant.id);
  if (!customerId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!(await assertOwnsAddress(admin, params.id, customerId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { error } = await admin
    .from('customer_addresses')
    .delete()
    .eq('id', params.id)
    .eq('customer_id', customerId);
  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
