'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

// RSHIR-46: tenant moderation toggle for customer reviews. Soft-hide via
// hidden_at timestamp so we can unhide and so the row stays in the
// moderation UI for context. Public aggregate view filters hidden_at.
export async function toggleReviewHidden(
  reviewId: string,
  hidden: boolean,
  expectedTenantId: string,
): Promise<void> {
  if (!expectedTenantId) throw new Error('missing_tenant_id');
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  if (tenant.id !== expectedTenantId) throw new Error('tenant_mismatch');
  await assertTenantMember(user.id, expectedTenantId);

  const admin = createAdminClient();
  const { data: review, error: readErr } = await admin
    .from('restaurant_reviews')
    .select('id, tenant_id')
    .eq('id', reviewId)
    .eq('tenant_id', expectedTenantId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!review) throw new Error('Review not found.');

  const update = hidden
    ? { hidden_at: new Date().toISOString(), hidden_by: user.id }
    : { hidden_at: null, hidden_by: null };
  const { error } = await admin
    .from('restaurant_reviews')
    .update(update as never)
    .eq('id', reviewId)
    .eq('tenant_id', expectedTenantId);
  if (error) throw new Error(error.message);

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: hidden ? 'review.hidden' : 'review.unhidden',
    entityType: 'review',
    entityId: reviewId,
  });

  revalidatePath('/dashboard/reviews');
  revalidatePath('/dashboard/analytics');
}
