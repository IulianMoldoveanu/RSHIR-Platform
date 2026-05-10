'use server';

// Lane U — Status updates for support inbox. Platform-admin only.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const REVALIDATE = '/dashboard/admin/support';

async function requirePlatformAdmin(): Promise<{ userId: string; email: string } | { error: string }> {
  const supa = await createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user?.email) return { error: 'Nu sunteți autentificat.' };
  const allow = (process.env.HIR_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.includes(user.email.toLowerCase())) return { error: 'Acces interzis.' };
  return { userId: user.id, email: user.email };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESPONDED', 'RESOLVED', 'SPAM']),
  admin_note: z.string().max(2000).optional(),
});

export async function updateSupportMessage(
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requirePlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const parsed = updateSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'Date invalide.' };

  const { id, status, admin_note } = parsed.data;
  const admin = createAdminClient();

  const patch: Record<string, unknown> = { status };
  if (typeof admin_note === 'string') patch.admin_note = admin_note;
  if (status === 'RESOLVED') {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = guard.userId;
  } else {
    patch.resolved_at = null;
    patch.resolved_by = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('support_messages')
    .update(patch)
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(REVALIDATE);
  return { ok: true };
}
