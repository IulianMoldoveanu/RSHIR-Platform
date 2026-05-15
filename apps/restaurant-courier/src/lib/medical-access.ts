// MedicalAccessLog helper — appends an audit row whenever a courier or
// dispatcher views pharma medical-grade PII (customer name, address,
// prescription detail). Distinct from audit_log: audit_log captures
// actions performed on data, medical_access_logs captures reads.
//
// Per F2.2 of the courier master plan + DPA-TEMPLATE-2026-05-13.md, this
// is the evidence trail for a Legea 95 inspection or GDPR Art.30 records-
// of-processing request. 5-year retention.
//
// Failures swallowed — logging must never block the user surfacing the
// delivery. If the table is unreachable we'd rather render the delivery
// page than greet the rider with an error screen. The trade-off: a brief
// outage can lose a small fraction of access events. Acceptable in
// practice; the courier_order itself is the canonical record of who was
// assigned the delivery.

import { createAdminClient } from './supabase/admin';

export type MedicalAccessEntity =
  | 'courier_order'
  | 'pharma_anamnesis'
  | 'pharma_prescription'
  | 'pharma_patient';

export type MedicalAccessPurpose =
  | 'delivery'
  | 'dispatch'
  | 'audit'
  | 'support'
  | 'compliance_inspection';

export type LogMedicalAccessInput = {
  actorUserId: string;
  entityType: MedicalAccessEntity;
  entityId: string;
  purpose: MedicalAccessPurpose;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logMedicalAccess(input: LogMedicalAccessInput): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('medical_access_logs').insert({
      actor_user_id: input.actorUserId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      purpose: input.purpose,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Silent — surfacing a rendering error here would be worse than a
    // missing log row. Per the operational contract, logging is best-
    // effort; the courier_order remains the canonical record.
  }
}
