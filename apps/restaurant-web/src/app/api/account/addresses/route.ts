import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertSameOrigin } from '@/lib/origin-check';
import { getCurrentCustomerId } from '@/lib/account/current-customer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const addressSchema = z.object({
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  lat: z.number().refine((v) => v >= -90 && v <= 90).optional(),
  lng: z.number().refine((v) => v >= -180 && v <= 180).optional(),
  label: z.string().trim().max(60).optional().or(z.literal('')),
  isDefault: z.boolean().optional().default(false),
});

export async function GET() {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const customerId = await getCurrentCustomerId(tenant.id);
  if (!customerId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('customer_addresses')
    .select('id, line1, line2, city, postal_code, country, latitude, longitude, label, is_default')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  return NextResponse.json({ addresses: data ?? [] });
}

// A saved delivery address a logged-in customer can reuse at checkout
// without retyping it — the "detalii de livrare prestabilite" ask. The
// customer_addresses table already existed (initial schema) but had no
// write path or UI before this.
export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  const customerId = await getCurrentCustomerId(tenant.id);
  if (!customerId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = addressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request', issues: parsed.error.flatten() }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Cap at a sane number of saved addresses per customer — this is a
  // convenience list, not unbounded storage.
  const { count } = await admin
    .from('customer_addresses')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId);
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'too_many_addresses' }, { status: 422 });
  }

  // idx_customer_addresses_one_default enforces at most one is_default=true
  // per customer at the DB level — clear any existing default first so the
  // new insert doesn't hit that constraint when isDefault is requested.
  if (parsed.data.isDefault) {
    await admin
      .from('customer_addresses')
      .update({ is_default: false } as never)
      .eq('customer_id', customerId)
      .eq('is_default', true);
  }

  const { data, error } = await admin
    .from('customer_addresses')
    .insert({
      customer_id: customerId,
      line1: parsed.data.line1,
      line2: parsed.data.line2 || null,
      city: parsed.data.city,
      postal_code: parsed.data.postalCode || null,
      latitude: parsed.data.lat ?? null,
      longitude: parsed.data.lng ?? null,
      label: parsed.data.label || null,
      is_default: parsed.data.isDefault,
    } as never)
    .select('id, line1, line2, city, postal_code, country, latitude, longitude, label, is_default')
    .single();

  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  return NextResponse.json({ address: data }, { status: 201 });
}
