// Server-only read helpers for the Marketing Agent draft surface.
//
// Pulls rows from `marketing_drafts` filtered by tenant. Best-effort:
// degrades to [] if the migration hasn't applied yet (sibling pattern to
// `lib/ai/activity-queries.ts` to avoid mid-deploy crashes).

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type DraftStatus = 'draft' | 'approved' | 'discarded' | 'published';
export type DraftPlatform =
  | 'facebook'
  | 'instagram'
  | 'google_business'
  | 'tiktok'
  | 'generic';
export type DraftPostType = 'promo' | 'announcement' | 'engagement';

export type MarketingDraftRow = {
  id: string;
  platform: DraftPlatform;
  postType: DraftPostType;
  headlineRo: string | null;
  bodyRo: string;
  hashtags: string | null;
  ctaRo: string | null;
  status: DraftStatus;
  costUsd: number | null;
  model: string | null;
  createdAt: string | null;
};

const PLATFORMS = new Set<DraftPlatform>([
  'facebook',
  'instagram',
  'google_business',
  'tiktok',
  'generic',
]);
const POST_TYPES = new Set<DraftPostType>(['promo', 'announcement', 'engagement']);
const STATUSES = new Set<DraftStatus>(['draft', 'approved', 'discarded', 'published']);

export async function listMarketingDrafts(
  tenantId: string,
  opts?: { status?: DraftStatus; limit?: number },
): Promise<MarketingDraftRow[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 100);
    let q = admin
      .from('marketing_drafts')
      .select(
        'id, platform, post_type, headline_ro, body_ro, hashtags, cta_ro, status, cost_usd, model, created_at',
      )
      .eq('restaurant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts?.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) {
      console.warn('[marketing-drafts] list:', error.message);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((row: any): MarketingDraftRow => {
      const platform: DraftPlatform = PLATFORMS.has(row.platform as DraftPlatform)
        ? (row.platform as DraftPlatform)
        : 'generic';
      const postType: DraftPostType = POST_TYPES.has(row.post_type as DraftPostType)
        ? (row.post_type as DraftPostType)
        : 'promo';
      const status: DraftStatus = STATUSES.has(row.status as DraftStatus)
        ? (row.status as DraftStatus)
        : 'draft';
      return {
        id: String(row.id ?? ''),
        platform,
        postType,
        headlineRo: row.headline_ro ?? null,
        bodyRo: String(row.body_ro ?? ''),
        hashtags: row.hashtags ?? null,
        ctaRo: row.cta_ro ?? null,
        status,
        costUsd: row.cost_usd === null || row.cost_usd === undefined ? null : Number(row.cost_usd),
        model: row.model ?? null,
        createdAt: row.created_at ?? null,
      };
    });
  } catch (err) {
    console.warn('[marketing-drafts] list threw:', (err as Error).message);
    return [];
  }
}
