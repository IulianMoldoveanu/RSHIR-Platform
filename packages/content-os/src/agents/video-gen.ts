// VideoGenAgent — thin orchestrator around VideoProvider adapters.
//
// Responsibilities:
//   - Pick a provider for the brand's tier (basic/pro/enterprise) unless
//     a specific provider is requested (override).
//   - Enforce maxDurationSec from the chosen provider.
//   - Stamp a clientReferenceId for idempotency on retry.
//   - Surface cost estimate up-front so the orchestrator can bill-gate
//     before kicking off generation.

import type { BrandContext } from '../types';
import {
  getDefaultVideoProvider,
  getVideoProvider,
  type VideoGenJob,
  type VideoGenRequest,
  type VideoProvider,
  type VideoProviderName,
} from '../adapters/video';
import type { VisualPrompt } from './visual-director';
import { visualPromptToRequest } from '../adapters/video';

export interface VideoGenInput {
  brand: BrandContext;
  prompt: VisualPrompt;
  /** Stable id for retry idempotency (e.g. content_drafts.id). */
  clientReferenceId: string;
  /** Override the default provider for the brand's tier. */
  providerOverride?: VideoProviderName;
}

export interface VideoGenResult extends VideoGenJob {
  providerName: VideoProviderName;
}

export class VideoGenAgent {
  /**
   * Estimate cost in cents BEFORE submitting. Caller compares against
   * BrandContext.monthlyBudgetCents / month-to-date spend; if over, the
   * generation is skipped and the brief is marked budget-blocked.
   */
  estimateCostCents(input: VideoGenInput): {
    providerName: VideoProviderName;
    estimateCents: number;
    durationSec: number;
  } {
    const provider = this.resolveProvider(input);
    const dur = Math.min(input.prompt.durationSec, provider.maxDurationSec);
    return {
      providerName: provider.name,
      estimateCents: Math.ceil(dur * provider.costPerSecondCents),
      durationSec: dur,
    };
  }

  /**
   * Submit a generation. Returns the job (succeeded inline for mock,
   * queued for real providers). Caller polls getStatus to track real jobs.
   */
  async generate(input: VideoGenInput): Promise<VideoGenResult> {
    const provider = this.resolveProvider(input);
    const dur = Math.min(input.prompt.durationSec, provider.maxDurationSec);
    if (dur <= 0) {
      // Static format — caller should not have routed here, but bail safely.
      return {
        providerName: provider.name,
        providerJobId: `noop_${input.clientReferenceId}`,
        status: 'succeeded',
        videoUrl: undefined,
        durationSec: 0,
        costCents: 0,
      };
    }

    const req: VideoGenRequest & { clientReferenceId: string } = {
      ...visualPromptToRequest(input.prompt),
      durationSec: dur,
      clientReferenceId: input.clientReferenceId,
    };
    const job = await provider.generate(req);
    return { providerName: provider.name, ...job };
  }

  async getStatus(
    providerName: VideoProviderName,
    providerJobId: string,
  ): Promise<VideoGenJob> {
    const provider = getVideoProvider(providerName);
    return provider.getJobStatus(providerJobId);
  }

  private resolveProvider(input: VideoGenInput): VideoProvider {
    if (input.providerOverride) {
      return getVideoProvider(input.providerOverride);
    }
    return getDefaultVideoProvider(input.brand.tier);
  }
}
