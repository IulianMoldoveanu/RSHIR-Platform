import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// TODO: add captcha + rate limit before opening signup beyond invite-only.

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(SLUG_RE, 'Slug invalid'),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(72),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { name, slug, email, password } = parsed.data;

  const admin = createAdminClient();

  const { data: existingSlug, error: slugErr } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (slugErr) {
    return NextResponse.json({ error: slugErr.message }, { status: 500 });
  }
  if (existingSlug) {
    return NextResponse.json({ error: 'slug indisponibil' }, { status: 409 });
  }

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !created.user) {
    return NextResponse.json(
      { error: authErr?.message ?? 'Nu am putut crea utilizatorul' },
      { status: 400 },
    );
  }
  const userId = created.user.id;

  const { data: tenantRow, error: tenantErr } = await admin
    .from('tenants')
    .insert({ name, slug, status: 'ACTIVE', vertical: 'RESTAURANT' })
    .select('id')
    .single();
  if (tenantErr || !tenantRow) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: tenantErr?.message ?? 'Nu am putut crea restaurantul' },
      { status: 500 },
    );
  }
  const tenantId = tenantRow.id;

  const { error: memberErr } = await admin
    .from('tenant_members')
    .insert({ tenant_id: tenantId, user_id: userId, role: 'OWNER' });
  if (memberErr) {
    await admin.from('tenants').delete().eq('id', tenantId);
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  return NextResponse.json({ tenantId, userId, slug }, { status: 201 });
}
