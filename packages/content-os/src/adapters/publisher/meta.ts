// MetaProvider — publishes to Facebook Page + Instagram Business Account
// via Meta Graph API v21+. Single adapter for both surfaces because the
// auth + container model is shared.
//
// Docs:
//   FB Page feed: POST /{page_id}/feed     fields: message, link
//   FB Page video: POST /{page_id}/videos  multipart/form-data, file_url
//   IG container:  POST /{ig_account_id}/media + /media_publish
//   Insights: GET /{post_id}/insights?metric=impressions,reach,engagement
//
// The caller passes credentials.accountId as:
//   - facebook channel  → Page ID  (use Page Access Token in accessToken)
//   - instagram channel → IG Business Account ID
//
// For schedule, FB supports `scheduled_publish_time` (Unix ts, must be 10min
// to 6mo future). IG does NOT support scheduling via Graph API — caller
// must self-schedule (cron picks the row at scheduledFor time).

import type { PublishChannel } from '../../types';
import {
  composeCaption,
  type PostMetrics,
  type PublisherCredentials,
  type PublisherProvider,
  type PublishRequest,
  type PublishResult,
} from './base';

const META_GRAPH_VERSION = 'v21.0';
const FB_CAPTION_MAX = 63206;
const IG_CAPTION_MAX = 2200;

interface MetaPublishResponse {
  id?: string;
  post_id?: string;
  permalink_url?: string;
  permalink?: string;
}

interface MetaInsightsResponse {
  data?: Array<{ name?: string; values?: Array<{ value?: number | object }> }>;
}

abstract class MetaBaseProvider implements PublisherProvider {
  abstract readonly channel: PublishChannel;
  abstract readonly maxCaptionChars: number;
  // FB Page /feed supports scheduled_publish_time; IG Graph API does not.
  // Concrete classes override with their actual capability.
  abstract readonly supportsScheduling: boolean;
  readonly supportsVideo = true;
  readonly supportsCarousel = true;
  readonly supportsDelete = true;

  abstract publish(
    credentials: PublisherCredentials,
    request: PublishRequest,
  ): Promise<PublishResult>;

  async delete(
    credentials: PublisherCredentials,
    externalId: string,
  ): Promise<void> {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(externalId)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Meta delete ${externalId} failed: ${res.status} ${text.slice(0, 400)}`);
    }
  }

  async getMetrics(
    credentials: PublisherCredentials,
    externalId: string,
  ): Promise<PostMetrics> {
    const metricList = this.channel === 'instagram'
      ? 'impressions,reach,engagement,saved,video_views'
      : 'post_impressions,post_impressions_unique,post_engaged_users,post_clicks';
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(externalId)}/insights?metric=${metricList}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Meta insights ${externalId} failed: ${res.status} ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as MetaInsightsResponse;
    const metrics = this.parseInsightsResponse(json);
    return metrics;
  }

  private parseInsightsResponse(json: MetaInsightsResponse): PostMetrics {
    const lookup = (key: string): number => {
      const item = json.data?.find((d) => d.name === key);
      const v = item?.values?.[0]?.value;
      return typeof v === 'number' ? v : 0;
    };
    if (this.channel === 'instagram') {
      return {
        impressions: lookup('impressions'),
        reach: lookup('reach'),
        engagements: lookup('engagement'),
        clicks: 0, // IG Graph API does not surface outbound clicks
        conversions: 0,
        rawJson: json,
      };
    }
    return {
      impressions: lookup('post_impressions'),
      reach: lookup('post_impressions_unique'),
      engagements: lookup('post_engaged_users'),
      clicks: lookup('post_clicks'),
      conversions: 0,
      rawJson: json,
    };
  }
}

export class FacebookProvider extends MetaBaseProvider {
  readonly channel: PublishChannel = 'facebook';
  readonly maxCaptionChars = FB_CAPTION_MAX;
  readonly supportsScheduling = true;

  async publish(
    credentials: PublisherCredentials,
    request: PublishRequest,
  ): Promise<PublishResult> {
    const message = composeCaption(request.caption, request.hashtags, this.maxCaptionChars);
    const isVideo = request.mediaKind === 'video' && !!request.mediaUrl;
    const endpoint = isVideo
      ? `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(credentials.accountId)}/videos`
      : `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(credentials.accountId)}/feed`;

    const body: Record<string, string> = { access_token: credentials.accessToken };
    if (isVideo) {
      body.file_url = request.mediaUrl!;
      body.description = message;
    } else {
      body.message = message;
      if (request.mediaUrl) body.link = request.mediaUrl;
    }
    if (request.scheduledFor) {
      const ts = Math.floor(request.scheduledFor.getTime() / 1000);
      body.published = 'false';
      body.scheduled_publish_time = String(ts);
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Facebook publish failed: ${res.status} ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as MetaPublishResponse;
    const externalId = json.post_id ?? json.id;
    if (!externalId) {
      throw new Error('Facebook publish returned no post id');
    }
    return {
      externalId,
      permalink: json.permalink_url,
      status: request.scheduledFor ? 'scheduled' : 'published',
    };
  }
}

export class InstagramProvider extends MetaBaseProvider {
  readonly channel: PublishChannel = 'instagram';
  readonly maxCaptionChars = IG_CAPTION_MAX;
  // Codex P1 absorb: IG Graph API doesn't support `scheduled_publish_time`
  // on the /media or /media_publish endpoints — only FB Page /feed does.
  // Override the base class true so the scheduler doesn't hand IG posts
  // to publish() expecting them to wait; the cron picks the row at
  // scheduledFor instead.
  readonly supportsScheduling = false;

  async publish(
    credentials: PublisherCredentials,
    request: PublishRequest,
  ): Promise<PublishResult> {
    if (!request.mediaUrl) {
      throw new Error('Instagram requires a mediaUrl (image or video)');
    }
    const caption = composeCaption(request.caption, request.hashtags, this.maxCaptionChars);

    // Step 1: create media container (IG 2-step publish flow).
    const containerEndpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(credentials.accountId)}/media`;
    const containerBody: Record<string, string> = {
      access_token: credentials.accessToken,
      caption,
    };
    if (request.mediaKind === 'video') {
      containerBody.media_type = 'REELS';
      containerBody.video_url = request.mediaUrl;
    } else {
      containerBody.image_url = request.mediaUrl;
    }
    const containerRes = await fetch(containerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(containerBody).toString(),
    });
    if (!containerRes.ok) {
      const text = await containerRes.text().catch(() => '');
      throw new Error(`Instagram container creation failed: ${containerRes.status} ${text.slice(0, 500)}`);
    }
    const containerJson = (await containerRes.json()) as { id?: string };
    const containerId = containerJson.id;
    if (!containerId) {
      throw new Error('Instagram container returned no id');
    }

    // Step 2: publish container.
    const publishEndpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(credentials.accountId)}/media_publish`;
    const publishRes = await fetch(publishEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        access_token: credentials.accessToken,
        creation_id: containerId,
      }).toString(),
    });
    if (!publishRes.ok) {
      const text = await publishRes.text().catch(() => '');
      throw new Error(`Instagram media_publish failed: ${publishRes.status} ${text.slice(0, 500)}`);
    }
    const publishJson = (await publishRes.json()) as MetaPublishResponse;
    const externalId = publishJson.id;
    if (!externalId) {
      throw new Error('Instagram media_publish returned no id');
    }
    return {
      externalId,
      status: 'published',
    };
  }
}
