// XProvider — posts to X (formerly Twitter) via API v2.
//
// Docs: https://docs.x.com/x-api/posts/creation-of-a-post
//
// Auth: OAuth 2.0 user context with scope tweet.write + media.write.
// Token in Authorization header.
//
// Caption limit: 280 chars (Free/Basic), 25_000 (Premium). We assume Free
// tier defaults — caller can override via credentials.secondaryAccountId
// if they have Premium ("premium" string sentinel).
//
// Media: upload via /2/media/upload (POST multipart) → media_id_string,
// attach via media.media_ids on POST /2/tweets. For MVP we expect the
// caller to pre-upload and pass media_id in mediaUrl when needed.

import {
  composeCaption,
  type PostMetrics,
  type PublisherCredentials,
  type PublisherProvider,
  type PublishRequest,
  type PublishResult,
} from './base';
import type { PublishChannel } from '../../types';

const X_API_BASE = 'https://api.x.com';
const X_CAPTION_MAX_FREE = 280;
const X_CAPTION_MAX_PREMIUM = 25_000;

interface XTweetResponse {
  data?: { id?: string; text?: string };
  errors?: Array<{ message?: string; code?: number }>;
}

interface XMetricsResponse {
  data?: {
    id?: string;
    public_metrics?: {
      impression_count?: number;
      like_count?: number;
      reply_count?: number;
      retweet_count?: number;
      quote_count?: number;
      bookmark_count?: number;
    };
  };
}

export class XProvider implements PublisherProvider {
  readonly channel: PublishChannel = 'x';
  readonly maxCaptionChars = X_CAPTION_MAX_FREE;  // caller can opt into premium at runtime
  readonly supportsScheduling = false;
  readonly supportsVideo = true;       // requires pre-uploaded media_id
  readonly supportsCarousel = false;
  readonly supportsDelete = true;

  async publish(
    credentials: PublisherCredentials,
    request: PublishRequest,
  ): Promise<PublishResult> {
    const cap = credentials.secondaryAccountId === 'premium'
      ? X_CAPTION_MAX_PREMIUM
      : X_CAPTION_MAX_FREE;
    const text = composeCaption(request.caption, request.hashtags, cap);

    const body: Record<string, unknown> = { text };
    if (request.mediaUrl && /^\d+$/.test(request.mediaUrl)) {
      // mediaUrl is actually a pre-uploaded media_id_string (numeric).
      body.media = { media_ids: [request.mediaUrl] };
    }

    const res = await fetch(`${X_API_BASE}/2/tweets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`X publish failed: ${res.status} ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as XTweetResponse;
    if (json.errors?.length) {
      throw new Error(`X publish error: ${json.errors[0].message ?? 'unknown'}`);
    }
    const externalId = json.data?.id;
    if (!externalId) {
      throw new Error('X publish returned no tweet id');
    }
    return {
      externalId,
      permalink: `https://x.com/i/web/status/${externalId}`,
      status: 'published',
    };
  }

  async delete(
    credentials: PublisherCredentials,
    externalId: string,
  ): Promise<void> {
    const res = await fetch(
      `${X_API_BASE}/2/tweets/${encodeURIComponent(externalId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`X delete ${externalId} failed: ${res.status} ${text.slice(0, 400)}`);
    }
  }

  async getMetrics(
    credentials: PublisherCredentials,
    externalId: string,
  ): Promise<PostMetrics> {
    const fields = 'impression_count,like_count,reply_count,retweet_count,quote_count,bookmark_count';
    const res = await fetch(
      `${X_API_BASE}/2/tweets/${encodeURIComponent(externalId)}?tweet.fields=public_metrics&user.fields=${encodeURIComponent(fields)}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`X metrics failed: ${res.status} ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as XMetricsResponse;
    const m = json.data?.public_metrics;
    return {
      impressions: m?.impression_count ?? 0,
      reach: m?.impression_count ?? 0,
      engagements:
        (m?.like_count ?? 0) +
        (m?.reply_count ?? 0) +
        (m?.retweet_count ?? 0) +
        (m?.quote_count ?? 0) +
        (m?.bookmark_count ?? 0),
      clicks: 0,
      conversions: 0,
      rawJson: json,
    };
  }
}
