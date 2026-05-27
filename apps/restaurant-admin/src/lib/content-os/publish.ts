// Publish queue orchestrator.
//
// Called from /api/content/publish-tick. For each `content_publications`
// row with status='queued' AND scheduled_for<=now() we:
//   1. Load the draft + brief + brand + provider credentials.
//   2. Call the matching PublisherProvider (Meta/IG/TikTok/LinkedIn/X).
//   3. On success → UPDATE status='published', external_id, published_at.
//   4. On failure → UPDATE status='failed', error_message.
//
// Credentials gate: when `content_provider_credentials` is missing for the
// (brand, channel) pair, we mark the row failed with a clear message
// instead of throwing. This is the expected state until the OAuth
// onboarding wizard ships.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@hir/supabase-types/database';
import {
  getPublisherProvider,
  type PublishChannel,
  type PublisherCredentials,
  type PublishRequest,
} from '@hir/content-os';

export interface PublishTickStats {
  processed: number;
  succeeded: number;
  failed: number;
  skippedNoCreds: number;
}

interface PublishOpts {
  admin: SupabaseClient<Database>;
  now?: Date;
  /** Max rows processed per tick — guard against runaway backlog. */
  batchSize?: number;
}

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
  channel_account: string;
  scheduled_for: string;
}

interface DraftRow {
  id: string;
  body_json: Record<string, unknown>;
  brief_id: string;
}

interface BriefRow {
  id: string;
  brand_id: string;
}

interface CredsRow {
  credentials: PublisherCredentials;
}

export async function runPublishTick(opts: PublishOpts): Promise<PublishTickStats> {
  const { admin } = opts;
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? 25;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const stats: PublishTickStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skippedNoCreds: 0,
  };

  const { data: queueRows, error: queueErr } = await sb
    .from('content_publications')
    .select('id, draft_id, channel, channel_account, scheduled_for')
    .eq('status', 'queued')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(batchSize);
  if (queueErr) {
    throw new Error(`publish-tick: queue load failed: ${queueErr.message}`);
  }

  for (const pub of (queueRows ?? []) as PublicationRow[]) {
    stats.processed += 1;

    try {
      // Load draft → brief → brand chain.
      const { data: draft } = await sb
        .from('content_drafts')
        .select('id, body_json, brief_id')
        .eq('id', pub.draft_id)
        .maybeSingle();
      if (!draft) {
        await markFailed(sb, pub.id, 'draft_not_found');
        stats.failed += 1;
        continue;
      }
      const draftRow = draft as DraftRow;

      const { data: brief } = await sb
        .from('content_briefs')
        .select('id, brand_id')
        .eq('id', draftRow.brief_id)
        .maybeSingle();
      if (!brief) {
        await markFailed(sb, pub.id, 'brief_not_found');
        stats.failed += 1;
        continue;
      }
      const briefRow = brief as BriefRow;

      // Resolve credentials.
      const providerKind = CHANNEL_TO_PROVIDER_KIND[pub.channel];
      const { data: creds } = await sb
        .from('content_provider_credentials')
        .select('credentials')
        .eq('brand_id', briefRow.brand_id)
        .eq('provider_kind', providerKind)
        .eq('is_active', true)
        .maybeSingle();
      if (!creds) {
        await markFailed(
          sb,
          pub.id,
          `no_credentials_for_${providerKind}: conectează ${pub.channel} din onboarding`,
        );
        stats.skippedNoCreds += 1;
        continue;
      }
      const credentials = (creds as CredsRow).credentials;

      // Build PublishRequest from draft body_json.
      const body = draftRow.body_json as Record<string, unknown>;
      const caption = typeof body.fullText === 'string' && body.fullText.trim()
        ? (body.fullText as string)
        : [body.hook, body.body, body.cta].filter(Boolean).join('\n\n');
      const hashtags = Array.isArray(body.hashtags)
        ? (body.hashtags as string[])
        : [];
      const visual = (body.visual ?? {}) as Record<string, unknown>;
      const videoUrl = typeof visual.videoUrl === 'string' ? (visual.videoUrl as string) : undefined;

      const request: PublishRequest = {
        clientReferenceId: pub.id,
        caption,
        hashtags,
        mediaUrl: videoUrl,
        mediaKind: videoUrl ? 'video' : undefined,
        scheduledFor: undefined, // already past due — publish now
      };

      // Mark publishing → success/failure.
      await sb
        .from('content_publications')
        .update({ status: 'publishing' })
        .eq('id', pub.id);

      const provider = getPublisherProvider(pub.channel);
      const result = await provider.publish(credentials, request);

      await sb
        .from('content_publications')
        .update({
          status: 'published',
          external_id: result.externalId,
          published_at: now.toISOString(),
        })
        .eq('id', pub.id);

      // Mirror draft.status → published for dashboard counts.
      await sb
        .from('content_drafts')
        .update({ status: 'published' })
        .eq('id', draftRow.id);

      stats.succeeded += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markFailed(sb, pub.id, msg.slice(0, 500));
      stats.failed += 1;
    }
  }

  return stats;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markFailed(sb: any, publicationId: string, message: string): Promise<void> {
  await sb
    .from('content_publications')
    .update({ status: 'failed', error_message: message })
    .eq('id', publicationId);
}
