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
  const tags = hashtags.filter(Boolean).join(' ');
  const separator = tags ? '\n\n' : '';
  const full = `${caption}${separator}${tags}`;
  if (full.length <= maxChars) return full;
  // Trim caption to fit, keep all hashtags (they're load-bearing for discovery).
  const tagSpace = tags.length + separator.length;
  const captionBudget = Math.max(0, maxChars - tagSpace - 1);
  const trimmedCaption = caption.slice(0, captionBudget).trimEnd() + '…';
  return `${trimmedCaption}${separator}${tags}`;
}
