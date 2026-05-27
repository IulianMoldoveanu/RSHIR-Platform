// Map a `content_brand_contexts` row to the @hir/content-os BrandContext
// shape so the agents stay portable (no Supabase coupling). The agents
// expect a JS object; the DB stores voice / visual as JSONB and the rest
// in plain columns.
//
// Surgical mapper — narrow casts on the JSONB fields rather than schema
// validation. The Reflection loop polices template performance; if a
// patron sets a malformed voice json, the worst case is the agent emits
// boilerplate copy, which a human reviewer rejects in the drafts UI.

import type {
  BrandContext,
  BrandKind,
  BusinessType,
  MessagingKind,
  Tier,
  Tone,
} from '@hir/content-os';

interface BrandRow {
  id: string;
  tenant_id: string | null;
  brand_code: string;
  kind: string;
  business_type: string | null;
  display_name: string;
  tier: string;
  voice_json: Record<string, unknown> | null;
  visual_json: Record<string, unknown> | null;
  legal_json: Record<string, unknown> | null;
  competitors: string[] | null;
  monthly_budget_cents: number;
  preferred_messaging: string;
}

export function rowToBrandContext(row: BrandRow): BrandContext {
  const voice = (row.voice_json ?? {}) as {
    tone?: string;
    forbiddenTerms?: string[];
    personas?: string[];
    doNots?: string[];
    extra?: Record<string, unknown>;
  };
  const visual = (row.visual_json ?? {}) as {
    palette?: string[];
    fontFamily?: string;
    logoUrl?: string;
    brollUrls?: string[];
    extra?: Record<string, unknown>;
  };

  return {
    id: row.id,
    tenantId: row.tenant_id,
    brandCode: row.brand_code,
    kind: (row.kind === 'HIR_INTERNAL' ? 'HIR_INTERNAL' : 'TENANT_SAAS') as BrandKind,
    businessType: (row.business_type as BusinessType | null) ?? null,
    displayName: row.display_name,
    tier: (row.tier as Tier) ?? 'basic',
    voice: {
      tone: voice.tone as Tone | undefined,
      forbiddenTerms: voice.forbiddenTerms,
      // BrandContext.voice.personas is typed Persona[] (literal union). The
      // DB column stores text[]; trust the seed/onboard layer to keep it
      // valid. Casting keeps strict TS happy without runtime overhead.
      personas: voice.personas as BrandContext['voice']['personas'],
      doNots: voice.doNots,
      extra: voice.extra,
    },
    visual: {
      palette: visual.palette,
      fontFamily: visual.fontFamily,
      logoUrl: visual.logoUrl,
      brollUrls: visual.brollUrls,
      extra: visual.extra,
    },
    legal: row.legal_json,
    competitors: row.competitors ?? [],
    monthlyBudgetCents: row.monthly_budget_cents,
    preferredMessaging: (row.preferred_messaging === 'telegram' ? 'telegram' : 'whatsapp') as MessagingKind,
  };
}

export const BRAND_CONTEXT_COLUMNS =
  'id, tenant_id, brand_code, kind, business_type, display_name, tier, voice_json, visual_json, legal_json, competitors, monthly_budget_cents, preferred_messaging';
