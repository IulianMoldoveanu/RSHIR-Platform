// Hepi expansion contracts 2026-06-16 — Strategy Section 6.
// Interface definitions for per-stakeholder Hepi assistant. NOT YET WIRED.

export type HepiStakeholder =
  | "customer"
  | "courier"
  | "vendor_restaurant"
  | "vendor_pharmacy"
  | "fleet_manager"
  | "reseller"
  | "admin";

export interface HepiContext {
  stakeholder: HepiStakeholder;
  tenant_id?: string;
  partner_id?: string;
  fleet_id?: string;
  courier_user_id?: string;
  user_id: string;
  locale: "ro" | "en";
}

export interface HepiQuery {
  context: HepiContext;
  query: string;
  channel: "telegram" | "whatsapp" | "web";
  conversation_id?: string;
}

export interface HepiResponse {
  ok: boolean;
  reply_text: string;
  proposed_actions?: HepiAction[];
  cost_bani: number;
  model_used: string;
}

export interface HepiAction {
  id: string;
  category: "read_only" | "safe_write" | "high_risk";
  description: string;
  payload: Record<string, unknown>;
  requires_confirmation: boolean;
}
