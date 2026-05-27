import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RunwayProvider,
  PikaProvider,
  buildVideoProviderRegistry,
  getDefaultVideoProvider,
} from '../index';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('RunwayProvider', () => {
  const provider = new RunwayProvider({ apiKey: 'rwy_key' });

  it('throws if apiKey missing at construction', () => {
    expect(() => new RunwayProvider({ apiKey: '' })).toThrow(/apiKey required/);
  });

  it('uses image_to_video when referenceImageUrl provided', async () => {
    mockFetch.mockResolvedValueOnce(json({ id: 'task_1', status: 'PENDING' }));
    const job = await provider.generate({
      prompt: 'p',
      shotList: [],
      aspectRatio: '9:16',
      durationSec: 5,
      referenceImageUrl: 'https://cdn/ref.jpg',
      voiceoverLanguage: 'ro',
      clientReferenceId: 'draft-1',
    });
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/image_to_video');
    expect(job.providerJobId).toBe('task_1');
    expect(job.status).toBe('queued');
  });

  it('uses text_to_video when no reference image', async () => {
    mockFetch.mockResolvedValueOnce(json({ id: 'task_2' }));
    await provider.generate({
      prompt: 'p',
      shotList: [],
      aspectRatio: '9:16',
      durationSec: 5,
      voiceoverLanguage: 'ro',
    });
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/text_to_video');
  });

  it('sends Idempotency-Key header when clientReferenceId set', async () => {
    mockFetch.mockResolvedValueOnce(json({ id: 'task_3' }));
    await provider.generate({
      prompt: 'p',
      shotList: [],
      aspectRatio: '9:16',
      durationSec: 5,
      voiceoverLanguage: 'ro',
      clientReferenceId: 'draft-xyz',
    });
    expect(mockFetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('draft-xyz');
  });

  it('maps Runway SUCCEEDED to succeeded + extracts video URL', async () => {
    mockFetch.mockResolvedValueOnce(
      json({ id: 't', status: 'SUCCEEDED', output: ['https://cdn/runway.mp4'] }),
    );
    const status = await provider.getJobStatus('t');
    expect(status.status).toBe('succeeded');
    expect(status.videoUrl).toBe('https://cdn/runway.mp4');
  });

  it('maps RUNNING to running', async () => {
    mockFetch.mockResolvedValueOnce(json({ id: 't', status: 'RUNNING' }));
    const status = await provider.getJobStatus('t');
    expect(status.status).toBe('running');
  });

  it('clamps duration to maxDurationSec', async () => {
    mockFetch.mockResolvedValueOnce(json({ id: 'x' }));
    await provider.generate({
      prompt: 'p',
      shotList: [],
      aspectRatio: '9:16',
      durationSec: 999,
      voiceoverLanguage: 'ro',
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.duration).toBe(provider.maxDurationSec);
  });

  it('returns failed VideoGenJob on non-2xx fetch', async () => {
    mockFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const status = await provider.getJobStatus('t');
    expect(status.status).toBe('failed');
    expect(status.errorMessage).toContain('500');
  });
});

describe('PikaProvider', () => {
  const provider = new PikaProvider({ apiKey: 'pika_key' });

  it('throws on missing apiKey', () => {
    expect(() => new PikaProvider({ apiKey: '' })).toThrow(/apiKey required/);
  });

  it('returns queued status on submit', async () => {
    mockFetch.mockResolvedValueOnce(json({ id: 'job_1', status: 'pending' }));
    const job = await provider.generate({
      prompt: 'p',
      shotList: [],
      aspectRatio: '9:16',
      durationSec: 5,
      voiceoverLanguage: 'ro',
    });
    expect(job.providerJobId).toBe('job_1');
    expect(job.status).toBe('queued');
  });

  it('maps completed to succeeded + extracts video_url', async () => {
    mockFetch.mockResolvedValueOnce(
      json({ id: 'j', status: 'completed', video_url: 'https://cdn/p.mp4' }),
    );
    const status = await provider.getJobStatus('j');
    expect(status.status).toBe('succeeded');
    expect(status.videoUrl).toBe('https://cdn/p.mp4');
  });
});

describe('buildVideoProviderRegistry', () => {
  it('mock works without keys', () => {
    const reg = buildVideoProviderRegistry();
    expect(reg.mock()).toBeDefined();
  });

  it('runway/pika throw without keys', () => {
    const reg = buildVideoProviderRegistry();
    expect(() => reg.runway()).toThrow(/RUNWAY_API_KEY missing/);
    expect(() => reg.pika()).toThrow(/PIKA_API_KEY missing/);
  });

  it('runway/pika succeed with keys', () => {
    const reg = buildVideoProviderRegistry({
      runway: { apiKey: 'r' },
      pika: { apiKey: 'p' },
    });
    expect(reg.runway().name).toBe('runway');
    expect(reg.pika().name).toBe('pika');
  });

  it('getDefaultVideoProvider falls back to mock when tier provider unavailable', () => {
    const provider = getDefaultVideoProvider('pro'); // no real registry passed → uses default mock-only
    expect(provider.name).toBe('mock');
  });

  it('getDefaultVideoProvider uses tier-preferred when registry has it', () => {
    const reg = buildVideoProviderRegistry({ runway: { apiKey: 'r' } });
    const provider = getDefaultVideoProvider('pro', reg);
    expect(provider.name).toBe('runway');
  });
});
