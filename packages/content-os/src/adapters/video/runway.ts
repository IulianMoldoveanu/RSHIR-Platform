// RunwayProvider — AI video generation via Runway API (Gen-3 family).
//
// Docs: https://docs.dev.runwayml.com/
//
// Endpoints used:
//   POST /v1/image_to_video       (image-to-video, Gen-3 Alpha Turbo)
//   POST /v1/text_to_video        (text-to-video)
//   GET  /v1/tasks/{id}            (poll status)
//
// Auth: Bearer token in Authorization header.
//
// Pricing (Q2 2026):
//   - Gen-3 Alpha Turbo: $0.05/sec ($5 / 100 sec)
//   - Gen-3 Alpha:       $0.10/sec
// We default to Turbo for cost; orchestrator can request 'gen3-alpha'
// via styleTags=['high_fidelity'].
//
// Provider returns a task id immediately; caller polls getJobStatus.

import type {
  VideoGenJob,
  VideoGenRequest,
  VideoProvider,
  VideoProviderName,
} from './base';

const RUNWAY_API_BASE = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION = '2024-11-06';

interface RunwayTaskResponse {
  id?: string;
  status?: 'PENDING' | 'THROTTLED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  output?: string[];        // array of video URLs
  failure?: string;
  progress?: number;        // 0..1
}

export interface RunwayProviderOptions {
  apiKey: string;
  /** Override default model. 'gen3a_turbo' (default) or 'gen3a'. */
  model?: 'gen3a_turbo' | 'gen3a';
}

export class RunwayProvider implements VideoProvider {
  readonly name: VideoProviderName = 'runway';
  readonly costPerSecondCents = 5;       // gen3a_turbo default ($0.05/sec)
  readonly maxDurationSec = 10;           // Gen-3 max per task; longer = stitch multiple
  readonly supportsAvatar = false;
  readonly supportsReferenceImage = true;

  constructor(private readonly opts: RunwayProviderOptions) {
    if (!opts.apiKey) {
      throw new Error('RunwayProvider: apiKey required');
    }
  }

  async generate(
    request: VideoGenRequest & { clientReferenceId?: string },
  ): Promise<VideoGenJob> {
    const model = this.opts.model ?? 'gen3a_turbo';
    // Map aspect ratio to Runway's resolution preset.
    const ratio =
      request.aspectRatio === '9:16'
        ? '768:1280'
        : request.aspectRatio === '1:1'
          ? '960:960'
          : '1280:768';

    const endpoint = request.referenceImageUrl
      ? `${RUNWAY_API_BASE}/v1/image_to_video`
      : `${RUNWAY_API_BASE}/v1/text_to_video`;

    const body: Record<string, unknown> = {
      model,
      promptText: request.prompt,
      ratio,
      duration: Math.min(request.durationSec, this.maxDurationSec),
    };
    if (request.referenceImageUrl) {
      body.promptImage = request.referenceImageUrl;
    }
    if (request.clientReferenceId) {
      body.contentModeration = { publicFigureThreshold: 'auto' };
      // Runway's idempotency-key header is the canonical way (below).
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.opts.apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_VERSION,
    };
    if (request.clientReferenceId) {
      headers['Idempotency-Key'] = request.clientReferenceId;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Runway create failed: ${res.status} ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as RunwayTaskResponse;
    if (!json.id) {
      throw new Error('Runway create returned no task id');
    }
    return {
      providerJobId: json.id,
      status: 'queued',
    };
  }

  async getJobStatus(providerJobId: string): Promise<VideoGenJob> {
    const res = await fetch(
      `${RUNWAY_API_BASE}/v1/tasks/${encodeURIComponent(providerJobId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          'X-Runway-Version': RUNWAY_VERSION,
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        providerJobId,
        status: 'failed',
        errorMessage: `Runway status fetch ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as RunwayTaskResponse;
    const mapped = this.mapStatus(json.status);
    return {
      providerJobId,
      status: mapped,
      videoUrl: mapped === 'succeeded' ? json.output?.[0] : undefined,
      errorMessage: mapped === 'failed' ? json.failure : undefined,
    };
  }

  private mapStatus(s: RunwayTaskResponse['status']): VideoGenJob['status'] {
    switch (s) {
      case 'SUCCEEDED':
        return 'succeeded';
      case 'FAILED':
      case 'CANCELLED':
        return 'failed';
      case 'RUNNING':
        return 'running';
      default:
        return 'queued';
    }
  }
}
