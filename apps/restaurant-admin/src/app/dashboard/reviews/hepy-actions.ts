'use server';

// CS Agent server actions for the reviews page (Sprint 14).
//
// Three actions, all OWNER-or-STAFF gated via assertTenantMember:
//   1. generateReviewReplyDraft — calls Claude, persists DRAFT row
//   2. selectReviewReplyOption  — flips selected_option, status -> SELECTED
//   3. markReviewReplyPosted    — flips status -> POSTED, audits, writes
//                                  to orchestrator ledger
//   4. dismissReviewReplyDraft  — soft-close, status -> DISMISSED

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantMember, getActiveTenant } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { generateReviewReply } from '@/lib/ai/agents/cs-agent';

export type DraftSnapshot = {
  id: string;
  tenant_id: string;
  intent: string;
  status: 'DRAFT' | 'SELECTED' | 'POSTED' | 'DISMISSED';
  source_id: string | null;
  response_options: unknown;
  selected_option: number | null;
  posted_at: string | null;
  created_at: string;
};

// `cs_agent_responses` is not yet in the generated supabase types (it
// ships in this commit; types regenerate when the operator runs
// supabase/gen-types.mjs post-merge — same flow as audit_log,
// tenant_agent_trust, and similar new tables). Cast the admin client to
// any when touching this table; the rest of the type system catches
// downstream shape errors on DraftSnapshot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSb = any;

async function loadDraftById(draftId: string, tenantId: string): Promise<DraftSnapshot> {
  const admin = createAdminClient() as unknown as UntypedSb;
  const { data, error } = await admin
    .from('cs_agent_responses')
    .select('id, tenant_id, intent, status, source_id, response_options, selected_option, posted_at, created_at')
    .eq('id', draftId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Draft inexistent.');
  return data as DraftSnapshot;
}

export async function generateReviewReplyDraft(args: {
  reviewId: string;
  tenantId: string;
}): Promise<DraftSnapshot> {
  if (!args.reviewId || !args.tenantId) throw new Error('missing_args');

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  if (tenant.id !== args.tenantId) throw new Error('tenant_mismatch');
  await assertTenantMember(user.id, args.tenantId);

  const admin = createAdminClient() as unknown as UntypedSb;

  // If a DRAFT/SELECTED already exists for this review, return it. We don't
  // want to spawn a second LLM call (or a duplicate audit row).
  const { data: existing } = await admin
    .from('cs_agent_responses')
    .select('id, tenant_id, intent, status, source_id, response_options, selected_option, posted_at, created_at')
    .eq('tenant_id', args.tenantId)
    .eq('intent', 'review_reply')
    .eq('source_id', args.reviewId)
    .in('status', ['DRAFT', 'SELECTED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as DraftSnapshot;

  // Look up the review + tenant for the prompt context.
  const { data: review, error: revErr } = await admin
    .from('restaurant_reviews')
    .select('id, rating, comment, tenant_id')
    .eq('id', args.reviewId)
    .eq('tenant_id', args.tenantId)
    .maybeSingle();
  if (revErr) throw new Error(revErr.message);
  if (!review) throw new Error('Recenzie inexistentă.');

  const { data: tenantRow } = await admin
    .from('tenants')
    .select('name')
    .eq('id', args.tenantId)
    .maybeSingle();

  const generated = await generateReviewReply({
    tenantName: tenantRow?.name ?? 'Restaurant',
    rating: review.rating,
    comment: review.comment,
  });

  const { data: insertedRaw, error: insErr } = await admin
    .from('cs_agent_responses')
    .insert({
      tenant_id: args.tenantId,
      intent: 'review_reply',
      status: 'DRAFT',
      source_id: args.reviewId,
      response_options: generated as unknown as Record<string, unknown>,
      selected_option: null,
      created_by: user.id,
    } as never)
    .select('id, tenant_id, intent, status, source_id, response_options, selected_option, posted_at, created_at')
    .maybeSingle();
  if (insErr || !insertedRaw) throw new Error(insErr?.message ?? 'insert_failed');

  await logAudit({
    tenantId: args.tenantId,
    actorUserId: user.id,
    action: 'cs_response_generated',
    entityType: 'review',
    entityId: args.reviewId,
    metadata: {
      intent: 'review_reply',
      sentiment: generated.sentiment,
      confidence: generated.confidence,
    },
  });

  revalidatePath('/dashboard/reviews');
  return insertedRaw as DraftSnapshot;
}

export async function selectReviewReplyOption(args: {
  draftId: string;
  tenantId: string;
  selectedOption: number;
}): Promise<DraftSnapshot> {
  if (args.selectedOption < 0 || args.selectedOption > 2) throw new Error('invalid_option');
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  if (tenant.id !== args.tenantId) throw new Error('tenant_mismatch');
  await assertTenantMember(user.id, args.tenantId);

  const admin = createAdminClient() as unknown as UntypedSb;
  const { data, error } = await admin
    .from('cs_agent_responses')
    .update({ selected_option: args.selectedOption, status: 'SELECTED' } as never)
    .eq('id', args.draftId)
    .eq('tenant_id', args.tenantId)
    .in('status', ['DRAFT', 'SELECTED'])
    .select('id, tenant_id, intent, status, source_id, response_options, selected_option, posted_at, created_at')
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'update_failed');
  return data as DraftSnapshot;
}

export async function markReviewReplyPosted(args: {
  draftId: string;
  tenantId: string;
  finalText: string;
}): Promise<DraftSnapshot> {
  if (!args.finalText || args.finalText.trim().length < 10) {
    throw new Error('Textul răspunsului este prea scurt.');
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  if (tenant.id !== args.tenantId) throw new Error('tenant_mismatch');
  await assertTenantMember(user.id, args.tenantId);

  const admin = createAdminClient() as unknown as UntypedSb;

  // Load the existing draft so we can audit the chosen tone + final text.
  const draft = await loadDraftById(args.draftId, args.tenantId);
  if (draft.status === 'DISMISSED') throw new Error('Draft închis.');

  const opts = (draft.response_options as { options?: Array<{ tone: string; text: string }> })?.options;
  const chosenTone =
    typeof draft.selected_option === 'number' && opts ? opts[draft.selected_option]?.tone : null;

  const { data, error } = await admin
    .from('cs_agent_responses')
    .update({ status: 'POSTED', posted_at: new Date().toISOString() } as never)
    .eq('id', args.draftId)
    .eq('tenant_id', args.tenantId)
    .select('id, tenant_id, intent, status, source_id, response_options, selected_option, posted_at, created_at')
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'update_failed');

  await logAudit({
    tenantId: args.tenantId,
    actorUserId: user.id,
    action: 'cs_response_posted',
    entityType: 'review',
    entityId: draft.source_id ?? args.draftId,
    metadata: {
      intent: draft.intent,
      tone: chosenTone,
      // Store length + first ~120 chars to stay diagnostic without dumping
      // PII into audit logs.
      final_text_length: args.finalText.length,
      final_text_preview: args.finalText.slice(0, 120),
    },
  });

  revalidatePath('/dashboard/reviews');
  return data as DraftSnapshot;
}

export async function dismissReviewReplyDraft(args: {
  draftId: string;
  tenantId: string;
}): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated.');
  const { tenant } = await getActiveTenant();
  if (tenant.id !== args.tenantId) throw new Error('tenant_mismatch');
  await assertTenantMember(user.id, args.tenantId);

  const admin = createAdminClient() as unknown as UntypedSb;
  const draft = await loadDraftById(args.draftId, args.tenantId);

  // Codex P2 #356: never overwrite a POSTED row with DISMISSED. The UI
  // surfaces an "Închide" button on already-posted drafts (so the OWNER
  // can collapse the panel after publishing) and the legacy code wrote
  // a misleading "dismissed" audit entry + lost the posted status. The
  // client now treats POSTED collapse as local-only; the server still
  // hard-stops here so a malicious or stale request cannot regress the
  // status either.
  if (draft.status === 'POSTED') {
    return; // no-op, no audit row
  }
  if (draft.status === 'DISMISSED') {
    return; // already dismissed; idempotent
  }

  await admin
    .from('cs_agent_responses')
    .update({ status: 'DISMISSED' } as never)
    .eq('id', args.draftId)
    .eq('tenant_id', args.tenantId)
    .in('status', ['DRAFT', 'SELECTED']); // belt-and-braces against races

  await logAudit({
    tenantId: args.tenantId,
    actorUserId: user.id,
    action: 'cs_response_dismissed',
    entityType: 'review',
    entityId: draft.source_id ?? args.draftId,
    metadata: { intent: draft.intent, prior_status: draft.status },
  });

  revalidatePath('/dashboard/reviews');
}
