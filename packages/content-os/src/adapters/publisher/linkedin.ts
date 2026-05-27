// LinkedInProvider — publishes to LinkedIn Page or Personal profile via
// Versioned REST Posts API (/rest/posts + X-Restli-Protocol-Version: 2.0.0).
// Codex P1 absorb: /v2/posts hits the legacy surface; the versioned
// equivalent lives under /rest/posts.
//
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/posts-api
//
// Auth: OAuth 2.0 with scopes w_organization_social (for Page) or
// w_member_social (for personal). Token in Authorization header.
//
// Caption limit: 3000 chars. Hashtags inline (LinkedIn doesn't strip).
// Scheduling: NOT supported on /v2/posts endpoint — caller schedules in DB.
// Delete: DELETE /v2/posts/{urn}

import {
  composeCaption,
  type PostMetrics,
  type PublisherCredentials,
  type PublisherProvider,
  type PublishRequest,
  type PublishResult,
} from './base';
import type { PublishChannel } from '../../types';

const LINKEDIN_API_BASE = 'https://api.linkedin.com';
const LINKEDIN_CAPTION_MAX = 3000;

interface LinkedInPostResponse {
  id?: string;       // urn:li:share:1234... or x-restli-id header
}

export class LinkedInProvider implements PublisherProvider {
  readonly channel: PublishChannel = 'linkedin';
  readonly maxCaptionChars = LINKEDIN_CAPTION_MAX;
  readonly supportsScheduling = false;
  readonly supportsVideo = true;
  readonly supportsCarousel = false;
  readonly supportsDelete = true;

  async publish(
    credentials: PublisherCredentials,
    request: PublishRequest,
  ): Promise<PublishResult> {
    const commentary = composeCaption(request.caption, request.hashtags, this.maxCaptionChars);
    // `author` URN encodes whether this is a Page or Person post.
    // accountId expected formats:
    //   urn:li:organization:12345 (Page)
    //   urn:li:person:abcdef       (Personal)
    const author = credentials.accountId.startsWith('urn:li:')
      ? credentials.accountId
      : `urn:li:organization:${credentials.accountId}`;

    const body: Record<string, unknown> = {
      author,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    // LinkedIn's /v2/posts supports media via separate upload-then-attach flow.
    // For MVP we attach via `content.media` reference if a pre-uploaded URN
    // is supplied via mediaUrl (caller is responsible for upload step before).
    if (request.mediaUrl && request.mediaUrl.startsWith('urn:li:')) {
      body.content = {
        media: {
          id: request.mediaUrl,
          title: request.caption.slice(0, 200),
        },
      };
    }

    const res = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202412',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LinkedIn publish failed: ${res.status} ${text.slice(0, 500)}`);
    }
    // LinkedIn returns the URN in the `x-restli-id` header on success.
    const urn = res.headers.get('x-restli-id') ?? '';
    if (!urn) {
      // Fall back to body parse for older API responses.
      const json = (await res.json().catch(() => ({}))) as LinkedInPostResponse;
      if (!json.id) {
        throw new Error('LinkedIn publish returned no urn');
      }
      return { externalId: json.id, status: 'published' };
    }
    return {
      externalId: urn,
      permalink: `https://www.linkedin.com/feed/update/${urn}`,
      status: 'published',
    };
  }

  async delete(
    credentials: PublisherCredentials,
    externalId: string,
  ): Promise<void> {
    const res = await fetch(
      `${LINKEDIN_API_BASE}/rest/posts/${encodeURIComponent(externalId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202412',
        },
      },
    );
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`LinkedIn delete ${externalId} failed: ${res.status} ${text.slice(0, 400)}`);
    }
  }

  async getMetrics(
    credentials: PublisherCredentials,
    externalId: string,
  ): Promise<PostMetrics> {
    // LinkedIn /v2/socialActions/{shareUrn} returns likes + comments.
    // Impressions / reach require the Marketing API (paid Pages product).
    // We fall back to social actions if marketing scope is unavailable.
    const res = await fetch(
      `${LINKEDIN_API_BASE}/v2/socialActions/${encodeURIComponent(externalId)}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202412',
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LinkedIn social actions failed: ${res.status} ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      likesSummary?: { totalLikes?: number };
      commentsSummary?: { totalFirstLevelComments?: number };
    };
    const likes = json.likesSummary?.totalLikes ?? 0;
    const comments = json.commentsSummary?.totalFirstLevelComments ?? 0;
    return {
      impressions: 0,
      reach: 0,
      engagements: likes + comments,
      clicks: 0,
      conversions: 0,
      rawJson: json,
    };
  }
}
