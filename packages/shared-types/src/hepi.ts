/**
 * Hepi orchestrator contracts.
 *
 * Hepi is HIR's executive orchestrator: it READS the platform (KPIs, alerts)
 * and PROPOSES actions which are dispatched to server actions on confirm.
 * These types mirror the propose → confirm → execute envelope used by the
 * admin Hepi panel so any other surface (mobile, voice, batch) can speak the
 * same protocol.
 *
 * Pure types only. The HMAC token format / signing key live elsewhere; here
 * the token is just an opaque string.
 *
 * NOTE: kept here as a forward-compatible mirror; canonical contract still
 * lives in the active admin app and may grow new action kinds first. New
 * kinds should be added here in the same release.
 */

import type { IsoTimestamp, Uuid } from "./identity";

/**
 * Hepi autonomy mode for a given user/tenant. `confirm` is fail-safe (every
 * action requires explicit confirm). `direct` lets whitelisted actions run
 * without prompt (audit-only).
 */
export type HepiAutonomyMode = "confirm" | "direct";

/** Kind of action Hepi may propose. Allow-list — never accept free strings. */
export type HepiActionKind =
  | "TENANT_CREATE"
  | "TENANT_UPDATE"
  | "TENANT_PAUSE"
  | "TENANT_RESUME"
  | "CITY_ACTIVATE"
  | "CITY_DEACTIVATE"
  | "FLEET_ASSIGN_TENANT"
  | "FLEET_PAUSE"
  | "COURIER_TRANSFER"
  | "ORDER_REASSIGN"
  | "ORDER_REFUND"
  | "MARKETPLACE_PUBLISH"
  | "MARKETPLACE_WITHDRAW";

/**
 * HepiProposal — a structured action Hepi suggests. `args` is opaque to the
 * envelope; the action whitelist registry validates its shape per `kind`.
 */
export interface HepiProposal {
  readonly id: Uuid;
  readonly kind: HepiActionKind;
  readonly title: string;
  readonly rationale: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly riskLevel: "low" | "medium" | "high";
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

/**
 * HepiConfirmation — opaque HMAC token returned when a proposal is approved.
 * Submitted back to `/execute`, where the server re-validates signature, TTL,
 * single-use semantics, and whitelist before running the action.
 */
export interface HepiConfirmation {
  readonly proposalId: Uuid;
  readonly token: string;
  readonly issuedAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

/** Outcome envelope for `/execute`. */
export type HepiExecutionStatus = "succeeded" | "failed" | "rejected" | "expired";

export interface HepiExecutionResult {
  readonly proposalId: Uuid;
  readonly status: HepiExecutionStatus;
  readonly executedAt: IsoTimestamp;
  readonly errorMessage?: string | null;
  readonly result?: Readonly<Record<string, unknown>> | null;
}

/** Per-user/tenant Hepi settings (mirrors `hepi_settings` row shape). */
export interface HepiSettings {
  readonly tenantId: Uuid;
  readonly autonomy: HepiAutonomyMode;
  readonly enabledKinds: ReadonlyArray<HepiActionKind>;
  readonly updatedAt: IsoTimestamp;
}
