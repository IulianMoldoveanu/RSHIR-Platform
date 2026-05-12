'use server';

// Mark a feedback report as RESOLVED. Platform-admin gated.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail as isPlatformAdmin } from '@/lib/auth/platform-admin';

export async function markResolvedAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');
  if (!isPlatformAdmin(user.email)) return;

  // feedback_reports lands in supabase-types after the generator next runs;
  // until then we cast to bypass the table-name union check (mirrors the
  // pattern used in dashboard/admin/partners/page.tsx).
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  await admin
    .from('feedback_reports')
    .update({ status: 'RESOLVED', resolved_at: new Date().toISOString() })
    .eq('id', id);

  revalidatePath(`/dashboard/feedback/${id}`);
  revalidatePath('/dashboard/feedback');
}
