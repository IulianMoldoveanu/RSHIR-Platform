/**
 * Medical access log helper — records every READ of pharma PII by a courier
 * or dispatcher into the `medical_access_logs` table.
 *
 * DISTINCTION FROM audit_log
 * --------------------------
 * `audit_log`          — captures _actions_ (status changes, fleet ops).
 * `medical_access_logs` — captures _reads_ of sensitive personal health data
 *                          (customer name, address, prescription details).
 *
 * LEGAL BASIS
 * -----------
 * Required by Legea 95/2006 (Romanian Medicines Act, Art. 800–808) and
 * GDPR Art. 30 (records of processing activities). Rows must be retained
 * for 5 years. This table is the forensic evidence for a regulatory
 * inspection or a data-subject access request.
 *
 * WHEN TO CALL
 * ------------
 * Call `logMedicalAccess` from any server action or page that renders
 * pharma-vertical PII to a courier (order detail page, dispatch view).
 * Pass `purpose='delivery'` for normal courier access; `purpose='audit'`
 * or `'compliance_inspection'` for platform-admin reads.
 *
 * FAILURE POLICY
 * --------------
 * Failures are swallowed silently. A missing log row is preferable to
 * blocking a courier mid-delivery with a 500 error. The `courier_order`
 * row (which records `assigned_courier_user_id`) remains the canonical
 * record of who handled the delivery.
 *
 * See also: `MedicalAccessEntity`, `MedicalAccessPurpose` for allowed values.
 */

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
