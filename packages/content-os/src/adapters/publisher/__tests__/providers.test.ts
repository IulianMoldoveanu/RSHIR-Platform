import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublisherProvider } from '../index';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('FacebookProvider', () => {
  const provider = getPublisherProvider('facebook');
  const creds = { accessToken: 'tok', accountId: 'page123' };

  it('publishes text post via /feed', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'page123_99', permalink_url: 'https://fb/x' }));
    const out = await provider.publish(creds, {
      clientReferenceId: 'd1',
      caption: 'Hello',
      hashtags: ['#a'],
    });
    expect(out.externalId).toBe('page123_99');
    expect(out.status).toBe('published');
    expect(mockFetch.mock.calls[0][0]).toContain('/page123/feed');
  });

  it('publishes video via /videos when mediaKind=video', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'vid_1' }));
    await provider.publish(creds, {
      clientReferenceId: 'd2',
      caption: 'Hi',
      hashtags: [],
      mediaUrl: 'https://cdn/v.mp4',
      mediaKind: 'video',
    });
    expect(mockFetch.mock.calls[0][0]).toContain('/page123/videos');
  });

  it('passes scheduled_publish_time when scheduledFor set', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'p1' }));
    const when = new Date('2027-01-01T10:00:00Z');
    const result = await provider.publish(creds, {
      clientReferenceId: 'd3',
      caption: 'X',
      hashtags: [],
      scheduledFor: when,
    });
    expect(result.status).toBe('scheduled');
    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain('scheduled_publish_time');
    expect(body).toContain(String(Math.floor(when.getTime() / 1000)));
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'bad' }, 400));
    await expect(
      provider.publish(creds, { clientReferenceId: 'd4', caption: 'h', hashtags: [] }),
    ).rejects.toThrow(/Facebook publish failed/);
  });

  it('deletes via DELETE on graph URL', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 200 }));
    await provider.delete(creds, 'page123_99');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('InstagramProvider', () => {
  const provider = getPublisherProvider('instagram');
  const creds = { accessToken: 'tok', accountId: 'igacct' };

  it('rejects publish without mediaUrl', async () => {
    await expect(
      provider.publish(creds, { clientReferenceId: 'd1', caption: 'h', hashtags: [] }),
    ).rejects.toThrow(/requires a mediaUrl/);
  });

  it('runs 2-step container + media_publish flow', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'ctn123' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'media_456' }));
    const out = await provider.publish(creds, {
      clientReferenceId: 'd1',
      caption: 'Insta',
      hashtags: [],
      mediaUrl: 'https://cdn/img.jpg',
      mediaKind: 'image',
    });
    expect(out.externalId).toBe('media_456');
    expect(out.status).toBe('published');
    expect(mockFetch.mock.calls[0][0]).toContain('/igacct/media');
    expect(mockFetch.mock.calls[1][0]).toContain('/igacct/media_publish');
  });

  it('uses REELS media_type for video', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'ctn' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'media' }));
    await provider.publish(creds, {
      clientReferenceId: 'd1',
      caption: 'r',
      hashtags: [],
      mediaUrl: 'https://cdn/v.mp4',
      mediaKind: 'video',
    });
    const containerBody = mockFetch.mock.calls[0][1].body as string;
    expect(containerBody).toContain('media_type=REELS');
    expect(containerBody).toContain('video_url=');
  });
});

describe('TikTokProvider', () => {
  const provider = getPublisherProvider('tiktok');
  const creds = { accessToken: 'tok', accountId: 'tt1' };

  it('rejects non-video publish', async () => {
    await expect(
      provider.publish(creds, { clientReferenceId: 'd1', caption: 'h', hashtags: [] }),
    ).rejects.toThrow(/requires a video mediaUrl/);
  });

  it('returns processing status with publish_id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { publish_id: 'pub_1' } }));
    const out = await provider.publish(creds, {
      clientReferenceId: 'd1',
      caption: 'Hi',
      hashtags: ['#fyp'],
      mediaUrl: 'https://cdn/v.mp4',
      mediaKind: 'video',
    });
    expect(out.externalId).toBe('pub_1');
    expect(out.status).toBe('processing');
  });

  it('throws when delete is called (not supported)', async () => {
    await expect(provider.delete(creds, 'pub_1')).rejects.toThrow(/does not support post deletion/);
  });
});

describe('LinkedInProvider', () => {
  const provider = getPublisherProvider('linkedin');
  const creds = { accessToken: 'tok', accountId: '12345' };

  it('publishes with organization URN', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:99' } }),
    );
    const out = await provider.publish(creds, {
      clientReferenceId: 'd1',
      caption: 'Pro',
      hashtags: ['#hr'],
    });
    expect(out.externalId).toBe('urn:li:share:99');
    expect(out.permalink).toContain('urn:li:share:99');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.author).toBe('urn:li:organization:12345');
  });

  it('passes existing URN if provided as accountId', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } }),
    );
    await provider.publish(
      { accessToken: 't', accountId: 'urn:li:person:abc' },
      { clientReferenceId: 'd', caption: 'h', hashtags: [] },
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.author).toBe('urn:li:person:abc');
  });
});

describe('XProvider', () => {
  const provider = getPublisherProvider('x');
  const creds = { accessToken: 'tok', accountId: 'xuser' };

  it('publishes a tweet and returns id + permalink', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: '1234' } }));
    const out = await provider.publish(creds, {
      clientReferenceId: 'd1',
      caption: 'short',
      hashtags: ['#go'],
    });
    expect(out.externalId).toBe('1234');
    expect(out.permalink).toContain('1234');
  });

  it('attaches media_id when mediaUrl is numeric', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: '5678' } }));
    await provider.publish(creds, {
      clientReferenceId: 'd',
      caption: 'h',
      hashtags: [],
      mediaUrl: '999888777',
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.media.media_ids).toEqual(['999888777']);
  });

  it('caption capped at 280 chars (Free tier default)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: '1' } }));
    const long = 'A'.repeat(500);
    await provider.publish(creds, {
      clientReferenceId: 'd',
      caption: long,
      hashtags: ['#a'],
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.text.length).toBeLessThanOrEqual(280);
  });
});
