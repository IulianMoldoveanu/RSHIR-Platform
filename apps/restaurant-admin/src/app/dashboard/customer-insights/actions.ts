'use server';

// CS Agent — weekly feedback digest action.
//
// Pulls last 7 days of `restaurant_reviews` + `support_messages` for the
// active tenant, runs Claude to summarise, persists a `cs_agent_responses`
// row of intent='feedback_digest' with source_id=ISO week label so we can
// dedupe by week.
//
// Reads only — no destructive ops. Trust gate is bypassed (read-only
// intent in the orchestrator registry); we still write an audit row so
// the OWNER sees Hepy ran.

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { generateFeedbackDigest } from '@/lib/ai/agents/cs-agent';

// `cs_agent_responses` not yet in generated supabase types — same pattern
// as audit_log + tenant_agent_trust. See hepy-actions.ts for the longer
// explanation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSb = any;

// ISO 8601 week label, e.g. "2026-W19". Same convention pg uses with
// `to_char(now(), 'IYYY"-W"IW')`. We compute client-side for the prompt
// but the persisted source_id is what dedupes future requests.
function isoWeekLabel(d: Date): string {
  // Algorithm: shift to nearest Thursday, week number is then days-from-jan-1
  // divided by 7. Standard ISO 8601.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export type DigestSnapshot = {
  id: string;
  tenant_id: string;
  source_id: string | null; // week label
  response_options: unknown; // FeedbackDigest shape
  created_at: string;
  // Counts that fed the digest, displayed to the OWNER for transparency.
  reviewCount: number;
  chatCount: number;
};

export async function generateOrGetWeeklyDigest(args: {
  tenantId: string;
  forceRefresh?: boolean;
}): Promise<DigestSnapshot> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  if (tenant.id !== args.tenantId) throw new Error('tenant_mismatch');
  await assertTenantMember(user.id, args.tenantId);

  const admin = createAdminClient() as unknown as UntypedSb;
  const week = isoWeekLabel(new Date());

  // Reuse if a fresh digest already exists for this week and OWNER didn't
  // ask for refresh. "Fresh" = same ISO week, regardless of generation
  // time (so two clicks 5 minutes apart don't burn tokens).
  if (!args.forceRefresh) {
    const { data: existing } = await admin
      .from('cs_agent_responses')
      .select('id, tenant_id, source_id, response_options, created_at')
      .eq('tenant_id', args.tenantId)
      .eq('intent', 'feedback_digest')
      .eq('source_id', week)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      // Re-fetch counts so the UI shows accurate "based on N reviews".
      const counts = await fetchWeeklyCounts(admin, args.tenantId);
      return {
        id: existing.id as string,
        tenant_id: existing.tenant_id as string,
        source_id: existing.source_id as string,
        response_options: existing.response_options,
        created_at: existing.created_at as string,
        reviewCount: counts.reviews,
        chatCount: counts.chats,
      };
    }
  }

  // Pull last 7 days of reviews + chat messages.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [reviewsResp, chatsResp, prevWeekResp] = await Promise.all([
    admin
      .from('restaurant_reviews')
      .select('rating, comment, created_at')
      .eq('tenant_id', args.tenantId)
      .is('hidden_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('support_messages')
      .select('category, message, created_at')
      .eq('tenant_id', args.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(80),
    fetchPreviousWeekSnapshot(admin, args.tenantId),
  ]);

  if (reviewsResp.error) throw new Error(reviewsResp.error.message);
  if (chatsResp.error) throw new Error(chatsResp.error.message);

  const { data: tenantRow } = await admin
    .from('tenants')
    .select('name')
    .eq('id', args.tenantId)
    .maybeSingle();

  type ReviewRow = { rating: number; comment: string | null; created_at: string };
  type ChatRow = { category: string | null; message: string; created_at: string };
  const reviews = ((reviewsResp.data ?? []) as ReviewRow[]).map((r) => ({
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
  }));
  const chats = ((chatsResp.data ?? []) as ChatRow[]).map((m) => ({
    category: m.category,
    message: m.message,
    created_at: m.created_at,
  }));

  const digest = await generateFeedbackDigest({
    tenantName: tenantRow?.name ?? 'Restaurant',
    weekIso: week,
    reviews,
    chatMessages: chats,
    previousWeek: prevWeekResp,
  });

  const { data: insertedRaw, error: insErr } = await admin
    .from('cs_agent_responses')
    .insert({
      tenant_id: args.tenantId,
      intent: 'feedback_digest',
      status: 'POSTED', // digests don't have a "post" lifecycle — they exist as soon as generated
      source_id: week,
      response_options: digest as unknown as Record<string, unknown>,
      selected_option: null,
      posted_at: new Date().toISOString(),
      created_by: user.id,
    } as never)
    .select('id, tenant_id, source_id, response_options, created_at')
    .maybeSingle();
  if (insErr || !insertedRaw) throw new Error(insErr?.message ?? 'insert_failed');

  await logAudit({
    tenantId: args.tenantId,
    actorUserId: user.id,
    action: 'cs_response_generated',
    entityType: 'feedback_digest',
    entityId: week,
    metadata: {
      intent: 'feedback_digest',
      week,
      review_count: reviews.length,
      chat_count: chats.length,
      sentiment_trend: digest.sentiment.trend,
    },
  });

  revalidatePath('/dashboard/customer-insights');
  return {
    id: insertedRaw.id as string,
    tenant_id: insertedRaw.tenant_id as string,
    source_id: insertedRaw.source_id as string,
    response_options: insertedRaw.response_options,
    created_at: insertedRaw.created_at as string,
    reviewCount: reviews.length,
    chatCount: chats.length,
  };
}

async function fetchWeeklyCounts(
  admin: UntypedSb,
  tenantId: string,
): Promise<{ reviews: number; chats: number }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [r, c] = await Promise.all([
    admin
      .from('restaurant_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('hidden_at', null)
      .gte('created_at', since),
    admin
      .from('support_messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', since),
  ]);
  return { reviews: r.count ?? 0, chats: c.count ?? 0 };
}

async function fetchPreviousWeekSnapshot(
  admin: UntypedSb,
  tenantId: string,
): Promise<{ avgRating: number | null; reviewCount: number } | null> {
  const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('restaurant_reviews')
    .select('rating')
    .eq('tenant_id', tenantId)
    .is('hidden_at', null)
    .gte('created_at', start)
    .lt('created_at', end);
  if (error || !data || data.length === 0) return null;
  const ratings = (data as Array<{ rating: number }>).map((r) => r.rating);
  const avg = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
  return { avgRating: Number(avg.toFixed(2)), reviewCount: ratings.length };
}
