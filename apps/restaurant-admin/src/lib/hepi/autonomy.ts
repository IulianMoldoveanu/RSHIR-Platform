// Hepi autonomy mode — how much it asks before acting.
//
//   - 'confirm' (DEFAULT, and the fail-safe): every action is proposed and waits
//     for an explicit click.
//   - 'direct': Hepi executes immediately when asked (still audited + gated).
//
// Read via the service-role client (the readers are platform-admin-gated
// servers). ANY failure (table missing, row missing, network) falls back to
// 'confirm' — the safe default — so Hepi can never silently gain autonomy.

import { createAdminClient } from '@/lib/supabase/admin';

export type HepiMode = 'confirm' | 'direct';

export async function getHepiMode(): Promise<HepiMode> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createAdminClient() as any;
    const { data, error } = await sb
      .from('hepi_settings')
      .select('mode')
      .eq('id', 'global')
      .maybeSingle();
    if (error) return 'confirm';
    return data?.mode === 'direct' ? 'direct' : 'confirm';
  } catch {
    return 'confirm';
  }
}
