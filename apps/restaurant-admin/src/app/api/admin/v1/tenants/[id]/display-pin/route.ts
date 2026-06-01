import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getTenantRole } from '@/lib/tenant';
import { createServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const scryptAsync = promisify(scrypt);

/**
 * Hash format: scrypt:<salt_hex>:<hash_hex>
 * Mirrors the implementation in apps/restaurant-courier/.../display/auth/route.ts.
 */
async function buildHash(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(pin, salt, 32)) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

const BodySchema = z.object({
  pin: z
    .string()
    .min(4, 'PIN must be at least 4 characters')
    .max(16, 'PIN must be at most 16 characters'),
  label: z.string().max(64).optional(),
});

/**
 * PUT /api/admin/v1/tenants/[id]/display-pin
 *
 * Set or rotate the display PIN for a tenant.
 * Allowed callers:
 *   - Platform admin (HIR_PLATFORM_ADMIN_EMAILS allow-list)
 *   - Tenant OWNER (authenticated via Supabase session + tenant_members.role = 'OWNER')
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tenantId } = await params;

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid_body', detail: String(e) }, { status: 400 });
  }

  // Authorization: platform admin OR tenant OWNER.
  const platformAdmin = await requirePlatformAdmin();
  if (!platformAdmin.ok) {
    const supa = await createServerClient();
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const role = await getTenantRole(user.id, tenantId);
    if (role !== 'OWNER') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantErr || !tenant) {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });
  }

  const pinHash = await buildHash(parsed.pin);

  // Upsert: unique index on tenant_id enforces one PIN per tenant.
  const { error: upsertErr } = await supabase
    .from('tenant_display_pins')
    .upsert(
      {
        tenant_id: tenantId,
        pin_hash: pinHash,
        label: parsed.label ?? null,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    );

  if (upsertErr) {
    return NextResponse.json(
      { error: 'upsert_failed', detail: upsertErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, tenant_id: tenantId });
}
