/**
 * Romanian labels for audit_log.action values surfaced to a courier viewing
 * their own activity history.
 *
 * Kept as a flat dictionary so the audit-viewer page can show a familiar
 * phrase ("Ai acceptat o ofertă") instead of the raw action_type slug. When
 * a new action is added to `CourierAuditAction`, a row should be appended
 * here too — the viewer falls back to the raw slug if a label is missing.
 */

export const COURIER_AUDIT_LABELS_RO: Record<string, string> = {
  // Fleet management — visible only to fleet managers viewing their own log
  'fleet.created': 'Ai creat o flotă',
  'fleet.updated': 'Ai actualizat o flotă',
  'fleet.activated': 'Ai activat o flotă',
  'fleet.deactivated': 'Ai dezactivat o flotă',
  'fleet.courier_invited': 'Ai invitat un curier în flotă',
  'fleet.api_key_created': 'Ai generat o cheie API',
  'fleet.api_key_revoked': 'Ai revocat o cheie API',
  'fleet.settings_updated': 'Ai actualizat setările flotei',
  'fleet.order_assigned': 'Ai asignat o comandă unui curier',
  'fleet.order_unassigned': 'Ai dezasignat o comandă',
  'fleet.courier_suspended': 'Ai suspendat un curier',
  'fleet.courier_reactivated': 'Ai reactivat un curier',
  'fleet.order_auto_assigned': 'O comandă a fost auto-asignată',
  'fleet.courier_self_invited': 'Ai trimis un link de invitare',
  'fleet.courier_note_updated': 'Ai actualizat o notă internă',
  'fleet.bulk_auto_assigned': 'Auto-asignare în lot',

  // Order lifecycle
  'order.cash_collected': 'Ai marcat plata cash',
  'order.cancelled_by_courier': 'Ai anulat o comandă',
  'order.force_cancelled_by_courier': 'Ai anulat o comandă la final de tură',

  // Geofence + GPS
  'delivery.geofence_warning': 'Avertizare geofence',
  'courier.geofence_alert': 'Alertă geofence',

  // Pharma + ID checks
  'pharma.callback_sent': 'Notificare farmacie trimisă',

  // Personal
  'earnings.exported': 'Ai exportat un raport de câștiguri',
  'courier.time_off_requested': 'Ai trimis o cerere de zile libere',
};

export function labelForAction(action: string): string {
  return COURIER_AUDIT_LABELS_RO[action] ?? action;
}

/**
 * Format an ISO timestamp as a short relative phrase in Romanian.
 *   < 60s     → "acum câteva secunde"
 *   < 60 min  → "acum N min"
 *   < 24 h    → "acum N ore"
 *   < 48 h    → "ieri la HH:MM"
 *   older     → "DD.MM.YYYY HH:MM"
 */
export function formatRoRelative(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const diffMs = now.getTime() - t.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'acum câteva secunde';
  const min = Math.floor(sec / 60);
  if (min < 60) return `acum ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `acum ${hr} ${hr === 1 ? 'oră' : 'ore'}`;
  const days = Math.floor(hr / 24);
  if (days < 2) {
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    return `ieri la ${hh}:${mm}`;
  }
  const dd = String(t.getDate()).padStart(2, '0');
  const mo = String(t.getMonth() + 1).padStart(2, '0');
  const yy = t.getFullYear();
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${dd}.${mo}.${yy} ${hh}:${mm}`;
}
