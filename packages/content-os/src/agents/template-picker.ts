// TemplatePickerAgent — matches an incoming brief against the pre-baked
// `content_templates` library and returns the best candidates ranked by
// fit. When a high-confidence match is found, downstream Copywriter only
// fills placeholders, avoiding a full LLM generation pass.
//
// Strategy: deterministic SQL-backed lookup (no LLM) on the 5-tuple
// natural key with progressively looser fallbacks. ~10× cost vs full gen.

import type { BusinessType, Format, Persona, Pillar } from '../types';

export interface PickInput {
  businessType: BusinessType;
  persona: Persona;
  goal: string;           // 'awareness' | 'lead' | 'conversion' | 'retention'
  pillar: Pillar;
  format: Format;
}

export interface TemplateRow {
  id: string;
  business_type: BusinessType;
  persona: Persona;
  goal: string;
  pillar: Pillar;
  format: Format;
  body_template: {
    hook_template?: string;
    body_template?: string;
    cta_template?: string;
    hashtags?: string[];
    visual_brief?: string;
    [k: string]: unknown;
  };
  performance: Record<string, unknown>;
  is_active: boolean;
  created_by: string;
}

export interface PickResult {
  template: TemplateRow;
  /**
   * Match quality score: 1.0 = exact 5-tuple match, lower values reflect
   * fallbacks (persona-loosened, pillar-loosened, business-loosened).
   */
  confidence: number;
  matchKind: 'exact' | 'persona_loose' | 'pillar_loose' | 'business_loose' | 'generic';
}

/**
 * Minimal Supabase-style client surface — provided as DI so the agent
 * stays portable to non-Supabase databases.
 */
export interface TemplatesRepository {
  findByExactKey(input: PickInput): Promise<TemplateRow | null>;
  findByPartial(input: Partial<PickInput>): Promise<TemplateRow[]>;
}

export class TemplatePickerAgent {
  constructor(private readonly repo: TemplatesRepository) {}

  /**
   * Return the best template for a brief, or null if nothing matches
   * even the most generic fallback. Caller falls back to full LLM gen
   * via CopywriterAgent in that case.
   */
  async pick(input: PickInput): Promise<PickResult | null> {
    // 1. Exact 5-tuple match
    const exact = await this.repo.findByExactKey(input);
    if (exact) {
      return { template: exact, confidence: 1.0, matchKind: 'exact' };
    }

    // 2. Loosen persona (try other personas for same business/goal/pillar/format)
    const personaLoose = await this.repo.findByPartial({
      businessType: input.businessType,
      goal: input.goal,
      pillar: input.pillar,
      format: input.format,
    });
    if (personaLoose.length > 0) {
      return {
        template: personaLoose[0],
        confidence: 0.75,
        matchKind: 'persona_loose',
      };
    }

    // 3. Loosen pillar (any pillar for same business/persona/goal/format)
    const pillarLoose = await this.repo.findByPartial({
      businessType: input.businessType,
      persona: input.persona,
      goal: input.goal,
      format: input.format,
    });
    if (pillarLoose.length > 0) {
      return {
        template: pillarLoose[0],
        confidence: 0.55,
        matchKind: 'pillar_loose',
      };
    }

    // 4. Loosen business (any business for same persona/goal/pillar/format)
    const businessLoose = await this.repo.findByPartial({
      persona: input.persona,
      goal: input.goal,
      pillar: input.pillar,
      format: input.format,
    });
    if (businessLoose.length > 0) {
      return {
        template: businessLoose[0],
        confidence: 0.4,
        matchKind: 'business_loose',
      };
    }

    // 5. Generic fallback: business_type='general' + same format only
    const generic = await this.repo.findByPartial({
      businessType: 'general' as BusinessType,
      format: input.format,
    });
    if (generic.length > 0) {
      return {
        template: generic[0],
        confidence: 0.2,
        matchKind: 'generic',
      };
    }

    return null;
  }
}
