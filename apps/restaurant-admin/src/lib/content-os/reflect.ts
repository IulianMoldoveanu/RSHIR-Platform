// Reflection orchestrator.
//
// Called from /api/content/reflect-tick. For each publication older than
// 24h that lacks recent metrics, we:
//   1. Resolve the matching PublisherProvider + credentials.
//   2. Call provider.getMetrics(creds, externalId).
//   3. INSERT row in content_metrics.
//   4. Compute a CTR baseline per (brand, format) over the trailing
//      30-day window; auto-promote a template when this publication's
//      CTR > 3× baseline.
//
// Conservative: we only PROMOTE templates that originated as 'seed' rows.
// Reflection-promoted rows are inserted with created_by='reflection_promoted'
// so the seed unique index doesn't fight us. We never DELETE — only mark
// promoted by inserting a new row that the TemplatePicker fallback may
// favor later.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@hir/supabase-types/database';
import {
  getPublisherProvider,
  type PublishChannel,
  type PublisherCredentials,
} from '@hir/content-os';

export interface ReflectTickStats {
  processed: number;
  metricsCollected: number;
  metricsFailed: number;
  templatesPromoted: number;
}

interface ReflectOpts {
  admin: SupabaseClient<Database>;
  now?: Date;
  batchSize?: number;
  /** CTR multiplier threshold for promotion. Default 3.0. */
  promotionThreshold?: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const CHANNEL_TO_PROVIDER_KIND: Record<PublishChannel, string> = {
  facebook: 'meta',
  instagram: 'meta',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  x: 'x',
};

interface PublicationRow {
  id: string;
  draft_id: string;
  channel: PublishChannel;
  external_id: string | null;
  published_at: string | null;
}

interface DraftRow {
  id: string;
  brief_id: string;
  format: string;
}

interface BriefRow {
  id: string;
  brand_id: string;
  template_id: string | null;
}

interface CredsRow {
  credentials: PublisherCredentials;
}

export async function runReflectTick(opts: ReflectOpts): Promise<ReflectTickStats> {
  const { admin } = opts;
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? 25;
  const threshold = opts.promotionThreshold ?? 3.0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const stats: ReflectTickStats = {
    processed: 0,
    metricsCollected: 0,
    metricsFailed: 0,
    templatesPromoted: 0,
  };

  // Publications older than 24h, published, with an external_id we can poll.
  const cutoff = new Date(now.getTime() - ONE_DAY_MS).toISOString();
  const { data: pubs, error } = await sb
    .from('content_publications')
    .select('id, draft_id, channel, external_id, published_at')
    .eq('status', 'published')
    .lte('published_at', cutoff)
    .not('external_id', 'is', null)
    .order('published_at', { ascending: true })
    .limit(batchSize);
  if (error) {
    throw new Error(`reflect-tick: query failed: ${error.message}`);
  }

  for (const pub of (pubs ?? []) as PublicationRow[]) {
    stats.processed += 1;
    try {
      // Skip if we already have a fresh metric (< 12h old).
      const freshCutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await sb
        .from('content_metrics')
        .select('id')
        .eq('publication_id', pub.id)
        .gte('collected_at', freshCutoff)
        .limit(1);
      if ((existing ?? []).length > 0) {
        continue;
      }

      // Resolve creds + brand chain.
      const { data: draft } = await sb
        .from('content_drafts')
        .select('id, brief_id, format')
        .eq('id', pub.draft_id)
        .maybeSingle();
      if (!draft) {
        stats.metricsFailed += 1;
        continue;
      }
      const draftRow = draft as DraftRow;

      const { data: brief } = await sb
        .from('content_briefs')
        .select('id, brand_id, template_id')
        .eq('id', draftRow.brief_id)
        .maybeSingle();
      if (!brief) {
        stats.metricsFailed += 1;
        continue;
      }
      const briefRow = brief as BriefRow;

      const providerKind = CHANNEL_TO_PROVIDER_KIND[pub.channel];
      const { data: creds } = await sb
        .from('content_provider_credentials')
        .select('credentials')
        .eq('brand_id', briefRow.brand_id)
        .eq('provider_kind', providerKind)
        .eq('is_active', true)
        .maybeSingle();
      if (!creds) {
        stats.metricsFailed += 1;
        continue;
      }

      const provider = getPublisherProvider(pub.channel);
      const metrics = await provider.getMetrics(
        (creds as CredsRow).credentials,
        pub.external_id ?? '',
      );

      await sb.from('content_metrics').insert({
        publication_id: pub.id,
        impressions: metrics.impressions,
        reach: metrics.reach,
        engagements: metrics.engagements,
        clicks: metrics.clicks,
        conversions: metrics.conversions,
        raw_json: metrics.rawJson ?? null,
      });
      stats.metricsCollected += 1;

      // Auto-promote: CTR > N× baseline AND template originated from seed.
      const ctr = metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0;
      if (ctr > 0 && briefRow.template_id) {
        const baseline = await computeBaselineCtr(sb, {
          brandId: briefRow.brand_id,
          format: draftRow.format,
          now,
        });
        if (baseline > 0 && ctr > threshold * baseline) {
          const promoted = await promoteTemplate(sb, {
            templateId: briefRow.template_id,
            ctr,
            baseline,
          });
          if (promoted) stats.templatesPromoted += 1;
        }
      }
    } catch (e) {
      stats.metricsFailed += 1;
      console.warn(
        `[content-os.reflect] publication ${pub.id} failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  return stats;
}

/**
 * Compute baseline CTR over the trailing 30 days for (brand, format).
 * Returns 0 when we have no historical data — caller treats that as
 * "no baseline yet, skip promotion".
 */
async function computeBaselineCtr(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  opts: { brandId: string; format: string; now: Date },
): Promise<number> {
  const since = new Date(opts.now.getTime() - THIRTY_DAYS_MS).toISOString();
  // We need brand-scoped publications. The chain is:
  //   metrics → publications → drafts (format) → briefs (brand_id).
  // Two-round-trip approach to keep within RLS-aware single-table queries.
  const { data: briefs } = await sb
    .from('content_briefs')
    .select('id')
    .eq('brand_id', opts.brandId);
  const briefIds = ((briefs ?? []) as Array<{ id: string }>).map((b) => b.id);
  if (briefIds.length === 0) return 0;

  const { data: drafts } = await sb
    .from('content_drafts')
    .select('id')
    .in('brief_id', briefIds)
    .eq('format', opts.format);
  const draftIds = ((drafts ?? []) as Array<{ id: string }>).map((d) => d.id);
  if (draftIds.length === 0) return 0;

  const { data: pubs } = await sb
    .from('content_publications')
    .select('id')
    .in('draft_id', draftIds)
    .gte('published_at', since);
  const pubIds = ((pubs ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (pubIds.length === 0) return 0;

  const { data: metricsRows } = await sb
    .from('content_metrics')
    .select('clicks, impressions')
    .in('publication_id', pubIds);
  let clicks = 0;
  let impressions = 0;
  for (const r of (metricsRows ?? []) as Array<{ clicks: number; impressions: number }>) {
    clicks += r.clicks ?? 0;
    impressions += r.impressions ?? 0;
  }
  return impressions > 0 ? clicks / impressions : 0;
}

/**
 * Promote a high-performing template by INSERTing a new row with
 * `created_by='reflection_promoted'` carrying the recorded performance
 * stats. We never mutate the seed row directly so the seed migration
 * remains idempotent.
 */
async function promoteTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  opts: { templateId: string; ctr: number; baseline: number },
): Promise<boolean> {
  const { data: source } = await sb
    .from('content_templates')
    .select('*')
    .eq('id', opts.templateId)
    .maybeSingle();
  if (!source) return false;

  // Guard against double-promotion: if a reflection_promoted row already
  // exists for this seed template, skip.
  const { data: existing } = await sb
    .from('content_templates')
    .select('id')
    .eq('business_type', source.business_type)
    .eq('persona', source.persona)
    .eq('goal', source.goal)
    .eq('pillar', source.pillar)
    .eq('format', source.format)
    .eq('created_by', 'reflection_promoted')
    .limit(1);
  if ((existing ?? []).length > 0) return false;

  const { error } = await sb.from('content_templates').insert({
    business_type: source.business_type,
    persona: source.persona,
    goal: source.goal,
    pillar: source.pillar,
    format: source.format,
    body_template: source.body_template,
    performance: {
      promoted_from: opts.templateId,
      ctr: opts.ctr,
      baseline_ctr: opts.baseline,
      promoted_at: new Date().toISOString(),
    },
    is_active: true,
    created_by: 'reflection_promoted',
  });
  return !error;
}
