// Compliance Agent — Deno-side canonical runtime (Sprint 17).
//
// Registered with the Master Orchestrator (PR #341) as the Compliance
// sub-agent. Three intents per lane brief COMPLIANCE-AGENT-SPRINT-17:
//
//   compliance.anaf_efactura_health   ← Telegram /compliance_anaf  /  admin tile
//   compliance.gdpr_data_audit        ← Telegram /compliance_gdpr  /  admin tile
//   compliance.legea_95_pharmacy_check ← Telegram /compliance_pharma / admin tile
//
// All three are READ-ONLY (`readOnly: true`) — they query Supabase rows
// and return a structured findings payload. NO writes. NO calling the
// ANAF SPV API directly (the OAuth credentials wiring is an Iulian-action
// gate that ships separately under Lane ANAF-EFACTURA Phase 2). NO
// triggering GDPR data deletion — we only IDENTIFY candidates that the
// OWNER can review and decide on manually.
//
// Why fully read-only: compliance findings are diagnostic, not mutative.
// They never touch customer-facing state. The orchestrator's `readOnly`
// flag tells the dispatcher to bypass the trust gate entirely (no
// PROPOSE_ONLY for "tell me about my fiscal config").
//
// Cost: V0 ships deterministic — no Anthropic call. Recommendations are
// rule-based (configured below). v1 may upgrade to Sonnet 4.5 for
// AI-generated tone if the Iulian-approved copy proves too rigid.
// Effective cost = $0/invocation. Comfortably under the $0.02 cap.

import {
  registerIntent,
  type HandlerContext,
  type HandlerPlan,
  type HandlerResult,
  type IntentHandler,
} from './master-orchestrator.ts';

// ---------------------------------------------------------------------------
// Constants — kept in sync with apps/restaurant-admin/src/lib/ai/agents/compliance-agent.ts
// (Node-side type mirror). Drift caught by compliance-agent.test.ts.
// ---------------------------------------------------------------------------

export const COMPLIANCE_AGENT_MODEL = 'claude-sonnet-4-5-20250929';

// GDPR stale customer threshold — 365 days of inactivity. See mirror file
// header for the legal rationale (RO consumer warranty = 2y, but the
// CUSTOMER RECORD itself can be redacted earlier when no active relation).
export const GDPR_STALE_CUSTOMER_DAYS = 365;

// Sample cap for PII audit events surfaced in the result. We don't dump
// the full audit log into the response (could be tens of thousands of
// rows on an active tenant); the OWNER follows the link to /audit if
// they need to dig. 10 most-recent events is enough for a smoke check.
const PII_AUDIT_SAMPLE_LIMIT = 10;

// Romanian CIF: optional "RO" + 2-10 digits. Must match `lib/efactura.ts`
// CIF_RE so the validity check is semantic-equivalent across surfaces.
const CIF_RE = /^(RO)?\d{2,10}$/i;

// Allowed VAT rates — must match `lib/fiscal.ts` ALLOWED_VAT_RATES.
// Includes historical rates (5/9/19) so the check doesn't false-flag a
// tenant exporting older months at the pre-2025-08-01 9% reduced rate.
const ALLOWED_VAT_RATES = new Set([0, 5, 9, 11, 19, 21]);

// Action prefixes that signal the audit_log row touched a PII field.
// Keep this list narrow — the goal is to surface "who looked up customer
// X's phone" type events, NOT every order status change. Matched as
// case-insensitive prefix on `audit_log.action`.
const PII_ACTION_PATTERNS = [
  'customer.',
  'customer_',
  'customer-',
  'gdpr.',
  'gdpr_',
  'redact',
  'export.customers',
  'pii.',
  'auth.user_lookup',
];

// ---------------------------------------------------------------------------
// Intent 1 — compliance.anaf_efactura_health
// ---------------------------------------------------------------------------

const anafEfacturaHealthHandler: IntentHandler = {
  // Read-only intents collapse plan + execute: the dispatcher will call
  // execute() right after plan() with the trust gate bypassed. We still
  // separate them for the orchestrator contract, but plan() is a no-op
  // shape check.
  plan: async (_ctx, _payload) => {
    const plan: HandlerPlan = {
      actionCategory: 'compliance.read',
      summary: 'Verificare configurare ANAF + e-Factura.',
      resolvedPayload: {},
    };
    return plan;
  },
  execute: async (ctx, _plan) => {
    const { data: tenantRow, error } = await ctx.supabase
      .from('tenants')
      .select('id, name, settings')
      .eq('id', ctx.tenantId)
      .maybeSingle();
    if (error) {
      throw new Error(`tenant_read_failed: ${error.message}`);
    }
    if (!tenantRow) {
      throw new Error('tenant_not_found');
    }

    const settings =
      tenantRow.settings && typeof tenantRow.settings === 'object'
        ? (tenantRow.settings as Record<string, unknown>)
        : {};
    const fiscal =
      settings.fiscal && typeof settings.fiscal === 'object'
        ? (settings.fiscal as Record<string, unknown>)
        : {};
    const efactura =
      settings.efactura && typeof settings.efactura === 'object'
        ? (settings.efactura as Record<string, unknown>)
        : {};

    // CIF: prefer settings.efactura.cif (the wizard's source of truth);
    // fall back to settings.fiscal.cui. Both are stored without the
    // "RO" prefix per the writer-side normalizers.
    const cifFromEf = typeof efactura.cif === 'string' ? efactura.cif.trim() : '';
    const cifFromFiscal = typeof fiscal.cui === 'string' ? fiscal.cui.trim() : '';
    const cif = cifFromEf || cifFromFiscal;
    const cif_present = cif.length > 0;
    const cif_valid_format = cif_present ? CIF_RE.test(cif) : false;

    const vatRaw = typeof fiscal.vat_rate_pct === 'number' ? fiscal.vat_rate_pct : null;
    const vat_rate_set = vatRaw !== null && ALLOWED_VAT_RATES.has(vatRaw);
    const vat_rate_pct = vat_rate_set ? vatRaw : null;

    const efactura_enabled = efactura.enabled === true;
    const stepRaw = efactura.step_completed;
    const efactura_step_completed =
      typeof stepRaw === 'number' && stepRaw >= 0 && stepRaw <= 4
        ? Math.floor(stepRaw)
        : 0;
    const lastStatusRaw = efactura.last_test_status;
    const last_test_status: 'OK' | 'FAILED' | null =
      lastStatusRaw === 'OK' || lastStatusRaw === 'FAILED' ? lastStatusRaw : null;
    const lastTestAtRaw =
      typeof efactura.last_test_at === 'string' ? efactura.last_test_at : null;
    const last_test_age_days = computeAgeDays(lastTestAtRaw);

    const missing_fields: string[] = [];
    if (!cif_present) missing_fields.push('cif');
    else if (!cif_valid_format) missing_fields.push('cif_format');
    if (!vat_rate_set) missing_fields.push('vat_rate_pct');
    if (!efactura_enabled) missing_fields.push('efactura.enabled');
    if (efactura_step_completed < 4) missing_fields.push('efactura.step_completed');

    const recommendations = buildAnafRecommendations({
      cif_present,
      cif_valid_format,
      vat_rate_set,
      efactura_enabled,
      efactura_step_completed,
      last_test_status,
      last_test_age_days,
    });

    const data = {
      cif_present,
      cif_valid_format,
      vat_rate_set,
      vat_rate_pct,
      efactura_enabled,
      efactura_step_completed,
      last_test_status,
      last_test_age_days,
      missing_fields,
      recommendations,
    };

    const result: HandlerResult = {
      summary: efactura_enabled
        ? `e-Factura ACTIV (pas ${efactura_step_completed}/4) — ${missing_fields.length} câmpuri lipsesc.`
        : `e-Factura INACTIV — ${recommendations.length} recomandări de configurare.`,
      data,
    };
    return result;
  },
};

function computeAgeDays(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  return days >= 0 ? days : 0;
}

function buildAnafRecommendations(args: {
  cif_present: boolean;
  cif_valid_format: boolean;
  vat_rate_set: boolean;
  efactura_enabled: boolean;
  efactura_step_completed: number;
  last_test_status: 'OK' | 'FAILED' | null;
  last_test_age_days: number | null;
}): string[] {
  const recs: string[] = [];
  if (!args.cif_present) {
    recs.push(
      'Completați CIF-ul firmei în Setări → Configurare fiscală. CIF-ul este obligatoriu pentru emiterea facturilor.',
    );
  } else if (!args.cif_valid_format) {
    recs.push(
      'Formatul CIF-ului introdus nu este valid (acceptat: 2-10 cifre, opțional cu prefixul "RO"). Verificați și corectați în Setări → Configurare fiscală.',
    );
  }
  if (!args.vat_rate_set) {
    recs.push(
      'Stabiliți cota TVA în Setări → Configurare fiscală. Valoarea implicită pentru HoReCa după 2025-08-01 este 11%.',
    );
  }
  if (!args.efactura_enabled) {
    if (args.efactura_step_completed === 0) {
      recs.push(
        'Începeți configurarea e-Factura din Setări → e-Factura. Procesul are 4 pași și include înregistrarea OAuth la ANAF.',
      );
    } else if (args.efactura_step_completed < 4) {
      recs.push(
        `Configurarea e-Factura este la pasul ${args.efactura_step_completed}/4. Continuați din Setări → e-Factura pentru a finaliza activarea.`,
      );
    } else {
      recs.push(
        'Configurarea e-Factura este completă, dar transmisia nu este încă activată. Apăsați "Activează" în Setări → e-Factura.',
      );
    }
  } else {
    if (args.last_test_status === 'FAILED') {
      recs.push(
        'Ultimul test de conexiune cu ANAF a eșuat. Rulați din nou testul din Setări → e-Factura → Testează conexiunea.',
      );
    }
    if (args.last_test_age_days !== null && args.last_test_age_days > 30) {
      recs.push(
        `Ultimul test de conexiune cu ANAF a fost rulat acum ${args.last_test_age_days} zile. Rerulați testul lunar pentru a detecta din timp eventualele expirări de certificat.`,
      );
    }
  }
  return recs;
}

// ---------------------------------------------------------------------------
// Intent 2 — compliance.gdpr_data_audit
// ---------------------------------------------------------------------------

const gdprDataAuditHandler: IntentHandler = {
  plan: async (_ctx, _payload) => {
    return {
      actionCategory: 'compliance.read',
      summary: 'Audit GDPR: clienți inactivi, evenimente PII, politică de retenție.',
      resolvedPayload: {},
    };
  },
  execute: async (ctx, _plan) => {
    // ----- 1. Stale customer count -----
    // We use customers.created_at as a coarse proxy for "no activity" — a
    // proper implementation would join restaurant_orders and check the
    // most recent order per customer, but that requires either a view or
    // a window query that may not exist on every project. The honest
    // signal here is "customer record older than 1 year" which is still
    // useful for the OWNER as a starting point for a manual review.
    const staleCutoffIso = new Date(
      Date.now() - GDPR_STALE_CUSTOMER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { count: staleCount, error: staleErr } = await ctx.supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .lt('created_at', staleCutoffIso);
    if (staleErr) {
      throw new Error(`stale_customers_query_failed: ${staleErr.message}`);
    }
    const stale_customers_count = typeof staleCount === 'number' ? staleCount : 0;

    // ----- 2. PII audit events sample -----
    // Pull the last 90 days of audit_log, filter client-side to action
    // patterns that touch PII. Doing the filter in JS rather than a
    // server-side OR-of-LIKE keeps the migration footprint zero and is
    // bounded because we cap the LIMIT to 200 — the sample we surface is
    // the 10 most recent matches.
    const auditWindowIso = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: auditRows, error: auditErr } = await ctx.supabase
      .from('audit_log')
      .select('action, entity_type, created_at')
      .eq('tenant_id', ctx.tenantId)
      .gte('created_at', auditWindowIso)
      .order('created_at', { ascending: false })
      .limit(200);
    if (auditErr) {
      throw new Error(`audit_log_query_failed: ${auditErr.message}`);
    }
    const auditRowsArr: Array<{ action: string; entity_type: string | null; created_at: string }> =
      Array.isArray(auditRows) ? auditRows : [];
    const piiMatches = auditRowsArr.filter((r) => isPiiAction(r.action));
    const pii_audit_events_count = piiMatches.length;
    const pii_audit_events_sample = piiMatches
      .slice(0, PII_AUDIT_SAMPLE_LIMIT)
      .map((r) => ({
        action: r.action,
        entity_type: r.entity_type,
        created_at: r.created_at,
      }));

    // ----- 3. Retention policy -----
    // The GDPR retention setting is not yet a first-class column. We
    // probe tenants.settings.gdpr.retention_days and report whether the
    // OWNER has set anything explicit. A null value is reported honestly
    // — the recommendation list will nudge them to set one.
    const { data: tenantRow, error: tenantErr } = await ctx.supabase
      .from('tenants')
      .select('settings')
      .eq('id', ctx.tenantId)
      .maybeSingle();
    if (tenantErr) {
      throw new Error(`tenant_read_failed: ${tenantErr.message}`);
    }
    const settings =
      tenantRow?.settings && typeof tenantRow.settings === 'object'
        ? (tenantRow.settings as Record<string, unknown>)
        : {};
    const gdprBlock =
      settings.gdpr && typeof settings.gdpr === 'object'
        ? (settings.gdpr as Record<string, unknown>)
        : {};
    const retentionRaw = gdprBlock.retention_days;
    const retention_days =
      typeof retentionRaw === 'number' && retentionRaw > 0 && retentionRaw <= 3650
        ? Math.floor(retentionRaw)
        : null;
    const retention_policy_set = retention_days !== null;

    const recommendations: string[] = [];
    if (!retention_policy_set) {
      recommendations.push(
        'Setați o politică de retenție pentru datele clienților (recomandat 730 zile = 2 ani, conform termenului legal de garanție pentru bunuri de larg consum). Setări → GDPR.',
      );
    }
    if (stale_customers_count > 0) {
      recommendations.push(
        `Aveți ${stale_customers_count} clienți cu înregistrări mai vechi de ${GDPR_STALE_CUSTOMER_DAYS} zile. Examinați manual și redactați (ștergeți email + telefon) înregistrările fără activitate recentă. NU se șterge automat.`,
      );
    }
    if (pii_audit_events_count > 0) {
      recommendations.push(
        `S-au detectat ${pii_audit_events_count} evenimente legate de PII în ultimele 90 zile. Verificați jurnalul de audit pentru accese neautorizate.`,
      );
    }

    const data = {
      stale_customers_count,
      stale_customers_threshold_days: GDPR_STALE_CUSTOMER_DAYS,
      pii_audit_events_count,
      pii_audit_events_sample,
      retention_policy_set,
      retention_days,
      recommendations,
    };

    return {
      summary: `Audit GDPR: ${stale_customers_count} clienți inactivi, ${pii_audit_events_count} evenimente PII (90z), retenție ${retention_policy_set ? 'setată' : 'NEsetată'}.`,
      data,
    };
  },
};

function isPiiAction(action: string): boolean {
  if (!action || typeof action !== 'string') return false;
  const a = action.toLowerCase();
  for (const pattern of PII_ACTION_PATTERNS) {
    if (a.startsWith(pattern) || a.includes(`.${pattern}`)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Intent 3 — compliance.legea_95_pharmacy_check
// ---------------------------------------------------------------------------
//
// Legea 95/2006 (Reforma în domeniul sănătății) governs pharmacy
// operations in Romania. Relevant articles for a delivery operator:
//   - Identity check at delivery for OTC and prescription medication.
//   - Pharmacist sign-off on dispensing decisions.
//   - Receipt + audit trail per dispensing event.
// HIR Restaurant Suite serves restaurants by default (vertical=RESTAURANT);
// when a tenant flips to vertical=pharma (via the courier-unification
// phase A migration), this intent fires the relevant reminders. For
// restaurant tenants the result short-circuits to applicable=false.

const legea95PharmacyCheckHandler: IntentHandler = {
  plan: async (_ctx, _payload) => {
    return {
      actionCategory: 'compliance.read',
      summary: 'Verificare cerințe Legea 95 (aplicabil doar pentru tenants farmacie).',
      resolvedPayload: {},
    };
  },
  execute: async (ctx, _plan) => {
    const { data: tenantRow, error: tErr } = await ctx.supabase
      .from('tenants')
      .select('id, vertical, settings')
      .eq('id', ctx.tenantId)
      .maybeSingle();
    if (tErr) {
      throw new Error(`tenant_read_failed: ${tErr.message}`);
    }
    if (!tenantRow) {
      throw new Error('tenant_not_found');
    }

    const verticalRaw =
      typeof tenantRow.vertical === 'string' ? tenantRow.vertical.toLowerCase() : '';
    const isPharma = verticalRaw === 'pharma';

    if (!isPharma) {
      // Short-circuit per lane brief — non-pharmacy tenants get a
      // minimal "not applicable" payload. We still echo `vertical` so
      // the UI can display "(restaurant — Legea 95 nu se aplică)".
      return {
        summary: `Legea 95 nu se aplică (vertical=${verticalRaw || 'restaurant'}).`,
        data: {
          applicable: false as const,
          vertical: verticalRaw || 'restaurant',
        },
      };
    }

    // Pharma tenant — count delivered orders in the last 30 days as a
    // signal of "active pharmacy ops". We don't gate the reminders on
    // this count (a pharma tenant with 0 orders still gets the
    // reminders), it is informational.
    const since30dIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: pharmaCount, error: pcErr } = await ctx.supabase
      .from('restaurant_orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .gte('created_at', since30dIso);
    if (pcErr) {
      throw new Error(`pharma_orders_query_failed: ${pcErr.message}`);
    }
    const pharma_orders_30d = typeof pharmaCount === 'number' ? pharmaCount : 0;

    // Probe whether the OWNER has wired a pharmacist-signoff field on
    // their order intake. We don't know the exact column name (it
    // belongs to the HIR-PHARMA repo's schema, not RSHIR-Platform), so
    // we look at settings.pharmacy.signoff_field_present as a self-
    // reported flag. If absent → recommend setting one up.
    const settings =
      tenantRow.settings && typeof tenantRow.settings === 'object'
        ? (tenantRow.settings as Record<string, unknown>)
        : {};
    const pharmacy =
      settings.pharmacy && typeof settings.pharmacy === 'object'
        ? (settings.pharmacy as Record<string, unknown>)
        : {};
    const pharmacist_signoff_field_present = pharmacy.signoff_field_present === true;

    const reminders: string[] = [
      'Verificare identitate la livrare: cereți curierului să compare numele de pe pachet cu actul de identitate al destinatarului (Legea 95/2006, art. 788).',
      'Sign-off farmacist: fiecare comandă cu medicamente trebuie să poarte numele și parafa farmacistului care a eliberat produsul.',
      'Păstrați chitanța eliberată pentru 5 ani (perioada minimă de arhivare conform Legea 95/2006).',
      'Pentru medicamente cu prescripție: cereți rețeta originală sau confirmarea PIAS înainte de eliberare.',
      'Afișați în storefront-ul farmaciei: codul autorizației de funcționare emisă de Ministerul Sănătății.',
    ];
    if (!pharmacist_signoff_field_present) {
      reminders.push(
        'Câmpul de sign-off farmacist NU este configurat în setările tenantului. Activați-l pentru a captura numele farmacistului la fiecare livrare.',
      );
    }

    return {
      summary: `Legea 95 — ${reminders.length} reamintiri pentru tenant farmacie (${pharma_orders_30d} comenzi/30z).`,
      data: {
        applicable: true as const,
        vertical: 'pharma' as const,
        pharma_orders_30d,
        reminders,
        pharmacist_signoff_field_present,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Registration — call this once on Edge Function cold start.
// Idempotent: registerIntent() ignores duplicates and warns to stderr.
// ---------------------------------------------------------------------------

export function registerComplianceAgentIntents(): void {
  registerIntent({
    name: 'compliance.anaf_efactura_health',
    agent: 'compliance',
    defaultCategory: 'compliance.read',
    description: 'Verifică starea configurării ANAF + e-Factura (CIF, TVA, OAuth).',
    readOnly: true,
    handler: anafEfacturaHealthHandler,
  });
  registerIntent({
    name: 'compliance.gdpr_data_audit',
    agent: 'compliance',
    defaultCategory: 'compliance.read',
    description: 'Audit GDPR: clienți inactivi, evenimente PII, politică retenție.',
    readOnly: true,
    handler: gdprDataAuditHandler,
  });
  registerIntent({
    name: 'compliance.legea_95_pharmacy_check',
    agent: 'compliance',
    defaultCategory: 'compliance.read',
    description: 'Reamintiri Legea 95 — aplicabil doar tenant-urilor farmacie.',
    readOnly: true,
    handler: legea95PharmacyCheckHandler,
  });
}

// Test-only export of internal handler refs so vitest can drive plan/
// execute directly without going through dispatchIntent. Production code
// uses dispatchIntent + the registry.
export const __TESTING__ = {
  anafEfacturaHealthHandler,
  gdprDataAuditHandler,
  legea95PharmacyCheckHandler,
  isPiiAction,
  computeAgeDays,
  buildAnafRecommendations,
};
