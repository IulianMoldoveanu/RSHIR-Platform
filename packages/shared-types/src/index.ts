/**
 * @hir/shared-types — barrel export.
 *
 * Consumer apps may import from the root:
 *
 *   import type { UnifiedOrder, PaymentLeg } from "@hir/shared-types";
 *
 * or from sub-paths for tighter dependency graphs:
 *
 *   import type { UnifiedOrder } from "@hir/shared-types/order";
 *
 * Both forms are wired in package.json `exports`.
 */

export * from "./identity";
export * from "./multi-vendor";
export * from "./payment";
export * from "./order";
export * from "./marketplace";
export * from "./ai";
export * from "./hepi";
export * from "./solo-pfa";
export * from "./subscription";
export * from "./rating";
export * from "./job-board";
export * from "./non-eu-permit";
