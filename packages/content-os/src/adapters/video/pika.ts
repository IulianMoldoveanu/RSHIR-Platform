// PikaProvider — AI video generation via Pika API.
//
// Docs: https://pika.art/docs (Pika 2.5)
//
// Endpoints used:
//   POST /v2/generate            (text-to-video / image-to-video)
//   GET  /v2/jobs/{id}            (poll status)
//
// Pricing (Q2 2026):
//   - Pika 2.5 Turbo: $0.01/sec
//   - Pika 2.5:        $0.02/sec
// Default Turbo for cost. Used as basic tier default per plan locked.
//
// Pika tends to be fast (~30s for 5s clip) and forgiving on prompt quality —
// good fit for iterative drafts before a Runway final pass.

import type {
  VideoGenJob,
  VideoGenRequest,
  VideoProvider,
  VideoProviderName,
} from './base';

const PIKA_API_BASE = 'https://api.pika.art';

interface PikaJobResponse {
  id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  error?: string;
  progress?: number;
}

export interface PikaProviderOptions {
  apiKey: string;
  model?: 'pika-2.5-turbo' | 'pika-2.5';
}

export class PikaProvider implements VideoProvider {
  readonly name: VideoProviderName = 'pika';
  readonly costPerSecondCents = 1;       // pika-2.5-turbo default ($0.01/sec)
  readonly maxDurationSec = 10;
  readonly supportsAvatar = false;
  readonly supportsReferenceImage = true;

  constructor(private readonly opts: PikaProviderOptions) {
    if (!opts.apiKey) {
      throw new Error('PikaProvider: apiKey required');
    }
  }

  async generate(
    request: VideoGenRequest & { clientReferenceId?: string },
  ): Promise<VideoGenJob> {
    const model = this.opts.model ?? 'pika-2.5-turbo';
    const aspect =
      request.aspectRatio === '9:16'
        ? '9:16'
        : request.aspectRatio === '1:1'
          ? '1:1'
          : '16:9';

    const body: Record<string, unknown> = {
      model,
      prompt: request.prompt,
      aspect_ratio: aspect,
      duration: Math.min(request.durationSec, this.maxDurationSec),
    };
    if (request.referenceImageUrl) {
      body.image_url = request.referenceImageUrl;
    }
    if (request.clientReferenceId) {
      body.client_reference_id = request.clientReferenceId;
    }

    const res = await fetch(`${PIKA_API_BASE}/v2/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Pika generate failed: ${res.status} ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as PikaJobResponse;
    if (!json.id) {
      throw new Error('Pika generate returned no job id');
    }
    return {
      providerJobId: json.id,
      status: this.mapStatus(json.status),
      videoUrl: json.video_url,
    };
  }

  async getJobStatus(providerJobId: string): Promise<VideoGenJob> {
    const res = await fetch(
      `${PIKA_API_BASE}/v2/jobs/${encodeURIComponent(providerJobId)}`,
      {
        headers: { Authorization: `Bearer ${this.opts.apiKey}` },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        providerJobId,
        status: 'failed',
        errorMessage: `Pika status fetch ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as PikaJobResponse;
    return {
      providerJobId,
      status: this.mapStatus(json.status),
      videoUrl: json.video_url,
      errorMessage: json.status === 'failed' ? json.error : undefined,
    };
  }

  private mapStatus(s: PikaJobResponse['status']): VideoGenJob['status'] {
    switch (s) {
      case 'completed':
        return 'succeeded';
      case 'failed':
        return 'failed';
      case 'processing':
        return 'running';
      default:
        return 'queued';
    }
  }
}
