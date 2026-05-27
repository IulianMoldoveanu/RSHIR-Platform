// VideoProvider — provider-agnostic interface for AI video generation.
//
// Adapters: Runway Gen-3 (default for pro tier), Pika 2.5 (basic tier
// drafts), Veo 3.1 (enterprise tier 4K), HeyGen (avatar talking-head
// + multi-language). The orchestrator picks one per BrandContext.tier
// or per format (avatar formats always go to HeyGen, regardless of tier).

import type { ShotSpec, VisualPrompt } from '../../agents/visual-director';

export type VideoProviderName = 'runway' | 'pika' | 'veo' | 'heygen' | 'mock';

export interface VideoGenRequest {
  prompt: string;
  shotList: ShotSpec[];
  aspectRatio: '9:16' | '1:1' | '16:9';
  durationSec: number;
  referenceImageUrl?: string;
  voiceoverText?: string;
  voiceoverLanguage?: 'ro' | 'en';
  styleTags?: string[];
}

export interface VideoGenJob {
  providerJobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  videoUrl?: string;       // populated when status='succeeded'
  durationSec?: number;
  costCents?: number;
  errorMessage?: string;
}

export interface VideoProvider {
  readonly name: VideoProviderName;
  readonly costPerSecondCents: number;
  readonly maxDurationSec: number;
  readonly supportsAvatar: boolean;
  /** True if provider can accept a reference image for style continuity. */
  readonly supportsReferenceImage: boolean;

  /**
   * Submit a generation request. Returns a job handle. Implementations
   * MUST be idempotent on (request, brandId) when a clientReferenceId is
   * provided — re-submitting the same job returns the existing handle.
   */
  generate(request: VideoGenRequest & { clientReferenceId?: string }): Promise<VideoGenJob>;

  /** Poll the provider for current job state. */
  getJobStatus(providerJobId: string): Promise<VideoGenJob>;
}

/** Helper: convert VisualPrompt → VideoGenRequest. */
export function visualPromptToRequest(p: VisualPrompt): VideoGenRequest {
  return {
    prompt: p.prompt,
    shotList: p.shotList,
    aspectRatio: p.aspectRatio,
    durationSec: p.durationSec,
    referenceImageUrl: p.referenceImageUrl,
    voiceoverText: p.voiceoverText,
    voiceoverLanguage: p.voiceoverLanguage,
    styleTags: p.styleTags,
  };
}
