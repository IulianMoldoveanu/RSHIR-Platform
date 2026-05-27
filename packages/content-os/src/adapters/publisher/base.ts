// PublisherProvider — provider-agnostic interface for posting to social
// platforms (Meta = FB+IG, TikTok, LinkedIn, X). Adapters wrap the
// platform's native HTTP API. NO third-party broker (Buffer, Blotato, etc.)
// per plan decision 2026-05-28 with Iulian.

import type { PublishChannel } from '../../types';

export interface PublisherCredentials {
  /** Provider-specific token bag, decrypted by caller before passing in. */
  accessToken: string;
  /** Long-lived refresh token where the provider supports it. */
  refreshToken?: string;
  /** For Meta IG, this is the IG Business Account ID; FB the Page ID. */
  accountId: string;
  /** Optional secondary id (e.g. FB Page Access Token holder Page ID). */
  secondaryAccountId?: string;
}

export interface PublishRequest {
  /** Locally-tracked draft.id, used for idempotency on retry. */
  clientReferenceId: string;
  /** Caption / body text shown alongside the media. */
  caption: string;
  /** 3-10 hashtags appended (provider may merge into caption). */
  hashtags: string[];
  /** Public URL of the media to post (image or video). */
  mediaUrl?: string;
  /** image / video. */
  mediaKind?: 'image' | 'video';
  /** When omitted, publish immediately. When set, schedule for this time. */
  scheduledFor?: Date;
}

export interface PublishResult {
  /** Platform's post id (so we can later delete or fetch metrics). */
  externalId: string;
  /** Public permalink to the live post. */
  permalink?: string;
  /** Some platforms only return a job id then notify via webhook. */
  status: 'published' | 'scheduled' | 'processing';
}

export interface PostMetrics {
  impressions: number;
  reach: number;
  engagements: number;  // likes + comments + shares (provider-specific aggregation)
  clicks: number;       // outbound clicks (where supported, else 0)
  conversions: number;  // attributed conversions from pixel (where supported)
  rawJson: unknown;
}

export interface PublisherProvider {
  readonly channel: PublishChannel;
  readonly maxCaptionChars: number;
  readonly supportsScheduling: boolean;
  readonly supportsVideo: boolean;
  readonly supportsCarousel: boolean;
  /** Whether deleting a post is supported via API (for AUTO_REVERSIBLE). */
  readonly supportsDelete: boolean;

  publish(
    credentials: PublisherCredentials,
    request: PublishRequest,
  ): Promise<PublishResult>;

  /** Remove a previously-published post. Used by trust gate rollback. */
  delete(credentials: PublisherCredentials, externalId: string): Promise<void>;

  /** Pull metrics for a previously-published post. */
  getMetrics(
    credentials: PublisherCredentials,
    externalId: string,
  ): Promise<PostMetrics>;
}

/**
 * Helper: merge caption + hashtags into a single platform-acceptable string,
 * respecting the channel-specific max length. Hashtags appended at end.
 */
export function composeCaption(
  caption: string,
  hashtags: string[],
  maxChars: number,
): string {
  const cleanTags = hashtags.filter(Boolean);
  const tags = cleanTags.join(' ');
  const separator = tags ? '\n\n' : '';
  const full = `${caption}${separator}${tags}`;
  if (full.length <= maxChars) return full;

  // Codex P2 absorb: when hashtags alone already exceed maxChars (e.g.
  // several long tags on X's 280-char cap), the previous implementation
  // returned `…\n\n${tags}` which still busted the cap and let the
  // platform reject the publish call. Drop tags from the right until the
  // tag block plus a 1-char ellipsis fits, then trim the caption.
  const ELLIPSIS = '…';
  let keptTags = [...cleanTags];
  while (keptTags.length > 0) {
    const tagStr = keptTags.join(' ');
    const sep = tagStr ? '\n\n' : '';
    // Reserve at least 1 char for ellipsis (caption is being trimmed too).
    const fits = tagStr.length + sep.length + 1 <= maxChars;
    if (fits) break;
    keptTags = keptTags.slice(0, -1); // drop the rightmost tag
  }
  const finalTags = keptTags.join(' ');
  const finalSep = finalTags ? '\n\n' : '';
  const captionBudget = Math.max(0, maxChars - finalTags.length - finalSep.length - ELLIPSIS.length);
  const trimmedCaption = caption.slice(0, captionBudget).trimEnd() + ELLIPSIS;
  const result = `${trimmedCaption}${finalSep}${finalTags}`;

  // Final guard — if even the ellipsis-only caption can't fit (maxChars < 1),
  // hard-truncate from the right.
  return result.length <= maxChars ? result : result.slice(0, maxChars);
}
