import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { getCurrentCustomerId } from '@/lib/account/current-customer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
});

export async function PATCH(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const customerId = await getCurrentCustomerId(tenant.id);
  if (!customerId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('customers')
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName || null,
      phone: parsed.data.phone || null,
    } as never)
    .eq('id', customerId)
    // Redundant with the customerId already being tenant-scoped by
    // getCurrentCustomerId, but cheap belt-and-suspenders against ever
    // accepting a cross-tenant id from a future caller.
    .eq('tenant_id', tenant.id);

  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
