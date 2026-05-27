// MockVideoProvider — deterministic in-memory provider for unit tests and
// local development before real API keys are wired up.
//
// Behavior:
//   - generate() instantly returns a 'succeeded' job with a placeholder URL
//     derived from a hash of the prompt (so the same input always yields
//     the same fake video URL — useful for snapshot tests).
//   - getJobStatus() returns the same job by id.

import { createHash } from 'node:crypto';
import type {
  VideoGenJob,
  VideoGenRequest,
  VideoProvider,
  VideoProviderName,
} from './base';

export class MockVideoProvider implements VideoProvider {
  readonly name: VideoProviderName = 'mock';
  readonly costPerSecondCents = 0;
  readonly maxDurationSec = 120;
  readonly supportsAvatar = true;
  readonly supportsReferenceImage = true;

  private readonly jobs = new Map<string, VideoGenJob>();

  async generate(
    request: VideoGenRequest & { clientReferenceId?: string },
  ): Promise<VideoGenJob> {
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          prompt: request.prompt,
          aspectRatio: request.aspectRatio,
          durationSec: request.durationSec,
          ref: request.clientReferenceId ?? '',
        }),
      )
      .digest('hex')
      .slice(0, 12);
    const providerJobId = `mock_${fingerprint}`;

    const existing = this.jobs.get(providerJobId);
    if (existing) return existing;

    const job: VideoGenJob = {
      providerJobId,
      status: 'succeeded',
      videoUrl: `https://mock.content-os.local/${fingerprint}.mp4`,
      durationSec: request.durationSec,
      costCents: 0,
    };
    this.jobs.set(providerJobId, job);
    return job;
  }

  async getJobStatus(providerJobId: string): Promise<VideoGenJob> {
    const job = this.jobs.get(providerJobId);
    if (!job) {
      return {
        providerJobId,
        status: 'failed',
        errorMessage: 'unknown job id (mock provider has no persistence)',
      };
    }
    return job;
  }
}
