'use server';

// Hepi autonomy toggle — Iulian configures how much Hepi asks before acting,
// like a vendor setting. 'confirm' (default) = propose + await a click;
// 'direct' = execute on ask. Platform-admin gated, service-role write, audited.

import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import type { HepiMode } from '@/lib/hepi/autonomy';

const PLATFORM_SENTINEL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export async function setHepiMode(
  args: { mode: HepiMode },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: auth.status === 401 ? 'Nu sunteți autentificat.' : 'Acces interzis.' };
  }
  if (args.mode !== 'confirm' && args.mode !== 'direct') {
    return { ok: false, error: 'Mod invalid.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const { error } = await sb
    .from('hepi_settings')
    .upsert(
      { id: 'global', mode: args.mode, updated_at: new Date().toISOString(), updated_by: auth.userId },
      { onConflict: 'id' },
    );
  if (error) {
    console.error('[admin/hepi] setHepiMode failed', error.message);
    return { ok: false, error: error.message };
  }

  void logAudit({
    tenantId: PLATFORM_SENTINEL_TENANT_ID,
    actorUserId: auth.userId,
    action: 'hepi.autonomy_changed',
    entityType: 'hepi_settings',
    entityId: 'global',
    metadata: { mode: args.mode },
  });

  revalidatePath('/dashboard/admin/hepi');
  return { ok: true };
}
