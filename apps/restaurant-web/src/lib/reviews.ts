import { getSupabaseAdmin } from './supabase-admin';

// RSHIR-39: aggregate rating per tenant. Reads the public view created by
// migration 20260430_001_restaurant_reviews.sql. Returns null when the
// tenant has no reviews yet — callers render the empty state.
export async function getReviewSummary(
  tenantId: string,
): Promise<{ average: number; count: number } | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('restaurant_review_summary')
    .select('review_count, average_rating')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) return null;
  const count = Number(data.review_count) || 0;
  if (count === 0) return null;
  return { average: Number(data.average_rating) || 0, count };
}
