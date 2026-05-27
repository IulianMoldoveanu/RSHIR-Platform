// VideoGenAgent — thin orchestrator around VideoProvider adapters.
//
// Responsibilities:
//   - Pick a provider for the brand's tier (basic/pro/enterprise) unless
//     a specific provider is requested (override).
//   - Enforce maxDurationSec from the chosen provider.
//   - Stamp a clientReferenceId for idempotency on retry.
//   - Surface cost estimate up-front so the orchestrator can bill-gate
//     before kicking off generation.
//   - Optional cap-check callback (Standard plan: 3 videos / tenant / month).
//     The package stays portable (no Supabase import); callers wire the
//     gate via the `capChecker` option. See apps/restaurant-admin/src/lib/usage-caps.ts.

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

/**
 * Result of an external cap check (e.g. usage-caps RPC).
 * `allowed=false` causes VideoGenAgent.generate() to throw a CapExceededError
 * BEFORE calling the video provider, so we never burn a Runway/Pika credit
 * on a request the patron isn't allowed to make.
 */
export interface CapCheckOutcome {
  allowed: boolean;
  /** Human-readable explanation surfaced on the UI / WhatsApp on rejection. */
  message?: string;
  used?: number;
  cap?: number;
}

export type CapChecker = (tenantId: string) => Promise<CapCheckOutcome>;

export class CapExceededError extends Error {
  readonly kind = 'cap_exceeded' as const;
  readonly used?: number;
  readonly cap?: number;
  constructor(message: string, opts?: { used?: number; cap?: number }) {
    super(message);
    this.name = 'CapExceededError';
    this.used = opts?.used;
    this.cap = opts?.cap;
  }
}

export interface VideoGenInput {
  brand: BrandContext;
  prompt: VisualPrompt;
  /** Stable id for retry idempotency (e.g. content_drafts.id). */
  clientReferenceId: string;
  /** Override the default provider for the brand's tier. */
  providerOverride?: VideoProviderName;
  /**
   * Optional cap enforcement. When provided, the agent invokes it BEFORE
   * submitting the generation request. Caller (admin app) wires this to
   * `checkAndIncrementUsage(tenantId, 'content_os_videos')`. Omitted
   * for HIR_INTERNAL brands (we self-cap by other means).
   */
  capChecker?: CapChecker;
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
   *
   * When `capChecker` is supplied, we gate the call BEFORE invoking the
   * video provider — a Runway/Pika credit must not burn when the patron
   * has hit the Standard-plan monthly cap. Throws CapExceededError so
   * the route handler can surface the polite Romanian copy to the UI.
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

    // Standard-plan cap (3 videos / tenant / month). Only checked for
    // TENANT_SAAS brands — HIR_INTERNAL brands are self-managed and the
    // caller must omit `capChecker` to opt out cleanly.
    if (input.capChecker && input.brand.tenantId) {
      const outcome = await input.capChecker(input.brand.tenantId);
      if (!outcome.allowed) {
        throw new CapExceededError(
          outcome.message ??
            `Cap atins pentru reclame video (${outcome.used ?? '?'}/${outcome.cap ?? '?'} luna asta).`,
          { used: outcome.used, cap: outcome.cap },
        );
      }
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
