/**
 * AI job contracts.
 *
 * Async AI work (LLM calls, embeddings, image analysis, etc.) is modelled as
 * jobs queued, executed by a worker pool, and persisted with provenance.
 * This file describes the cross-app shape so the producer (any app) and the
 * consumer (worker / Hepi / analytics) agree.
 *
 * Pure types only. No SDK imports — `provider` and `model` are free strings
 * so the contract survives provider migrations.
 */

import type { IsoTimestamp, Uuid } from "./identity";

/** Logical class of AI work. Extend cautiously — analytics filters on this. */
export type AIJobType =
  | "CHAT_COMPLETION"
  | "EMBEDDING"
  | "CLASSIFICATION"
  | "EXTRACTION"
  | "SUMMARIZATION"
  | "MODERATION"
  | "TRANSCRIPTION"
  | "VISION"
  | "TOOL_USE"
  | "HEPI_INTENT";

/** Lifecycle of a single AI job. */
export type AIJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

/** Resource cost of a single job. */
export interface AIJobUsage {
  readonly promptTokens?: number | null;
  readonly completionTokens?: number | null;
  readonly totalTokens?: number | null;
  readonly costMicroUsd?: number | null;
}

/**
 * AIJob — one unit of AI work. `input` / `output` are opaque to the
 * platform; the worker schema for a given `type` is owned by that worker.
 * Persist them so we can replay, audit, and bill.
 */
export interface AIJob {
  readonly id: Uuid;
  readonly type: AIJobType;
  readonly status: AIJobStatus;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly tenantId?: Uuid | null;
  readonly actorUserId?: Uuid | null;
  readonly input: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>> | null;
  readonly errorMessage?: string | null;
  readonly usage?: AIJobUsage | null;
  readonly createdAt: IsoTimestamp;
  readonly startedAt?: IsoTimestamp | null;
  readonly finishedAt?: IsoTimestamp | null;
  readonly idempotencyKey?: string | null;
}
