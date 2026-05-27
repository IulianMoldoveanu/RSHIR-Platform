// TikTokProvider — publishes to TikTok via Content Posting API.
//
// Docs: https://developers.tiktok.com/doc/content-posting-api-reference-post-video
//
// Flow:
//   1. POST /v2/post/publish/inbox/video/init/ with video URL → publish_id
//   2. TikTok pulls the video asynchronously; status via /v2/post/publish/status/fetch/
//   3. When status=PUBLISH_COMPLETE, the post is live.
//
// TikTok does NOT support scheduling via API for direct publish — caller
// must schedule at app layer (cron picks at scheduledFor).
//
// Caption max: 2200 chars (including hashtags). No image-only posts via
// this Content Posting API; only video. For static formats we fall back
// to Instagram. (Plan v2: TikTok Carousel via Photo Mode lands in future.)

import {
  composeCaption,
  type PostMetrics,
  type PublisherCredentials,
  type PublisherProvider,
  type PublishRequest,
  type PublishResult,
} from './base';
import type { PublishChannel } from '../../types';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com';
const TIKTOK_CAPTION_MAX = 2200;

interface TikTokInitResponse {
  data?: { publish_id?: string };
  error?: { code?: string; message?: string };
}

interface TikTokStatusResponse {
  data?: {
    status?: string;        // 'PROCESSING_UPLOAD' | 'PUBLISH_COMPLETE' | 'FAILED'
    publicaly_available_post_id?: string[];
    fail_reason?: string;
  };
}

interface TikTokVideoListResponse {
  data?: {
    videos?: Array<{
      id?: string;
      view_count?: number;
      like_count?: number;
      comment_count?: number;
      share_count?: number;
    }>;
  };
}

export class TikTokProvider implements PublisherProvider {
  readonly channel: PublishChannel = 'tiktok';
  readonly maxCaptionChars = TIKTOK_CAPTION_MAX;
  readonly supportsScheduling = false;  // app-layer schedule only
  readonly supportsVideo = true;
  readonly supportsCarousel = false;
  readonly supportsDelete = false;       // TikTok Content Posting API has no delete endpoint

  async publish(
    credentials: PublisherCredentials,
    request: PublishRequest,
  ): Promise<PublishResult> {
    if (request.mediaKind !== 'video' || !request.mediaUrl) {
      throw new Error('TikTok requires a video mediaUrl');
    }
    const title = composeCaption(request.caption, request.hashtags, this.maxCaptionChars);

    const initRes = await fetch(
      `${TIKTOK_API_BASE}/v2/post/publish/video/init/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title,
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: request.mediaUrl,
          },
        }),
      },
    );
    if (!initRes.ok) {
      const text = await initRes.text().catch(() => '');
      throw new Error(`TikTok init failed: ${initRes.status} ${text.slice(0, 500)}`);
    }
    const initJson = (await initRes.json()) as TikTokInitResponse;
    if (initJson.error?.code && initJson.error.code !== 'ok') {
      throw new Error(`TikTok init error: ${initJson.error.code} ${initJson.error.message ?? ''}`);
    }
    const publishId = initJson.data?.publish_id;
    if (!publishId) {
      throw new Error('TikTok init returned no publish_id');
    }

    // Return processing status — caller polls via getStatus or webhook callback.
    return {
      externalId: publishId,
      status: 'processing',
    };
  }

  /** Optional poll method (not part of the PublisherProvider interface). */
  async pollStatus(
    credentials: PublisherCredentials,
    publishId: string,
  ): Promise<{ status: string; postId?: string; failReason?: string }> {
    const res = await fetch(
      `${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`TikTok status failed: ${res.status} ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as TikTokStatusResponse;
    return {
      status: json.data?.status ?? 'UNKNOWN',
      postId: json.data?.publicaly_available_post_id?.[0],
      failReason: json.data?.fail_reason,
    };
  }

  async delete(_credentials: PublisherCredentials, _externalId: string): Promise<void> {
    throw new Error('TikTok Content Posting API does not support post deletion');
  }

  async getMetrics(
    credentials: PublisherCredentials,
    externalId: string,
  ): Promise<PostMetrics> {
    const res = await fetch(
      `${TIKTOK_API_BASE}/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filters: { video_ids: [externalId] } }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`TikTok metrics failed: ${res.status} ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as TikTokVideoListResponse;
    const v = json.data?.videos?.[0];
    return {
      impressions: v?.view_count ?? 0,
      reach: v?.view_count ?? 0,
      engagements: (v?.like_count ?? 0) + (v?.comment_count ?? 0) + (v?.share_count ?? 0),
      clicks: 0,
      conversions: 0,
      rawJson: json,
    };
  }
}
