// CopywriterAgent — produces copy variants for a content draft.
//
// Two modes:
//   1. Template-fill (cheap, deterministic): if TemplatePickerAgent
//      returned a high-confidence match, we simply replace placeholders
//      in the template body. No LLM call.
//   2. Full generation: if no template matched, the caller invokes the
//      LLM (Anthropic Sonnet 4.6) with a system prompt assembled from
//      BrandContext.voice and the brief. The agent provides the prompt
//      builder; the actual `fetch` to Anthropic lives in the orchestrator.
//
// Forbidden-terms sanitiser strips voice.forbiddenTerms (case-insensitive)
// from any generated output before persistence — defensive layer in case
// an LLM ignores the system instruction.

import type { BrandContext, Format, Persona, Pillar, Tone } from '../types';

export interface CopywriterPlaceholders {
  /** Brand identity */
  businessName: string;
  orașName?: string;
  websiteUrl?: string;
  phoneNumber?: string;
  messengerHandle?: string;

  /** Item-specific */
  itemName?: string;
  price?: string;
  dayContext?: string;
  urgency?: string;
  emoji?: string;

  /** Combo / event */
  priceCombo?: string;
  hoursLeft?: string;
  itemA?: string; priceA?: string;
  itemB?: string; priceB?: string;
  itemC?: string; priceC?: string;
  discountPct?: string;
  promoCode?: string;
  eventDate?: string;
  streetName?: string;
  pharmacistName?: string;

  /** HIR_INTERNAL specific */
  monthlyLossRon?: string;

  /** Catch-all */
  [k: string]: string | undefined;
}

export interface TemplateBody {
  hook_template?: string;
  body_template?: string;
  cta_template?: string;
  hashtags?: string[];
  visual_brief?: string;
}

export interface CopyDraft {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  fullText: string; // hook + '\n\n' + body + '\n\n' + cta — convenience for previews
}

export class CopywriterAgent {
  /**
   * Template-fill mode: replaces {placeholders} in the template body with
   * values from `vars`. Missing values leave the placeholder intact, which
   * the orchestrator may treat as a soft error (alert via Hepi: "completează
   * `{itemName}` și încerc din nou").
   */
  fillTemplate(
    template: TemplateBody,
    vars: CopywriterPlaceholders,
    brand: BrandContext,
  ): CopyDraft {
    const hook = this.applyPlaceholders(template.hook_template ?? '', vars);
    const body = this.applyPlaceholders(template.body_template ?? '', vars);
    const cta = this.applyPlaceholders(template.cta_template ?? '', vars);
    const hashtags = (template.hashtags ?? []).map((h) =>
      this.applyPlaceholders(h, vars),
    );

    const sanitized: CopyDraft = {
      hook: this.sanitizeForbidden(hook, brand.voice.forbiddenTerms ?? []),
      body: this.sanitizeForbidden(body, brand.voice.forbiddenTerms ?? []),
      cta: this.sanitizeForbidden(cta, brand.voice.forbiddenTerms ?? []),
      hashtags: hashtags.map((h) =>
        this.sanitizeForbidden(h, brand.voice.forbiddenTerms ?? []),
      ),
      fullText: '',
    };
    sanitized.fullText = [sanitized.hook, sanitized.body, sanitized.cta]
      .filter(Boolean)
      .join('\n\n');
    return sanitized;
  }

  /**
   * Build the system prompt the orchestrator sends to Anthropic when no
   * template matched. Pure string assembly — the actual API call happens
   * upstream (cost ledger lives there).
   */
  buildSystemPrompt(opts: {
    brand: BrandContext;
    persona: Persona;
    pillar: Pillar;
    format: Format;
  }): string {
    const { brand, persona, pillar, format } = opts;
    const tone: Tone = brand.voice.tone ?? 'amical';
    const forbidden = brand.voice.forbiddenTerms ?? [];
    const doNots = brand.voice.doNots ?? [];

    const parts: string[] = [];

    parts.push(`Ești copywriter pentru "${brand.displayName}".`);
    parts.push(`Limba: română. Format țintă: ${format}.`);
    parts.push(`Persona audiență: ${persona}. Pillar: ${pillar}.`);

    if (tone === 'amical') {
      parts.push(
        'Ton: prietenos și familiar (folosește "patroane", "frate", "nene" unde se potrivește). Fără jargon corporativ.',
      );
    } else if (tone === 'profesional') {
      parts.push(
        'Ton: profesional, formal, dar accesibil. Adresare cu "dumneavoastră" sau "Stimate ...".',
      );
    } else if (tone === 'tinerit') {
      parts.push(
        'Ton: energic, slang controlat, idiomuri Gen Z (emoji ok, dar moderat).',
      );
    }

    if (forbidden.length > 0) {
      parts.push(
        `INTERZIS să folosești cuvintele/expresiile: ${forbidden.map((t) => `"${t}"`).join(', ')}.`,
      );
    }
    if (doNots.length > 0) {
      parts.push(`De evitat: ${doNots.join('; ')}.`);
    }

    if (brand.competitors.length > 0) {
      parts.push(
        `Concurenți cunoscuți: ${brand.competitors.join(', ')}. Poți să-i menționezi factual, dar fără calomnie.`,
      );
    }

    parts.push('');
    parts.push('Format de output STRICT JSON:');
    parts.push(
      '{"hook":"...", "body":"...", "cta":"...", "hashtags":["#tag1","#tag2"]}',
    );
    parts.push('Hook: max 60 caractere. Body: max 220 caractere. CTA: max 60 caractere.');
    parts.push('Hashtags: 3-7 itemi, fără diacritice, lowercase, fără spații.');

    return parts.join('\n');
  }

  /**
   * Strip any forbidden term from a string. Case-insensitive whole-word
   * replacement. Multiple passes in case removal creates new matches.
   *
   * Unicode-aware: JS `\b` is ASCII-only and won't match boundaries around
   * Romanian diacritics (ș, ț, ă, î, â). We replace `\b` with explicit
   * Unicode-property lookarounds so a forbidden term like "subcontractări"
   * is actually stripped. Codex P2 absorb.
   */
  sanitizeForbidden(text: string, forbidden: string[]): string {
    if (!forbidden || forbidden.length === 0) return text;
    let out = text;
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (const term of forbidden) {
        if (!term) continue;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Lookbehind/lookahead negate "this position is inside a word"
        // using Unicode letter/number/underscore as the word definition.
        const re = new RegExp(
          `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
          'giu',
        );
        const next = out.replace(re, '').replace(/\s{2,}/g, ' ').trim();
        if (next !== out) {
          out = next;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return out;
  }

  /**
   * Replace {placeholder} occurrences. Leaves unknown placeholders intact
   * — caller may flag missing variables to the user before publish.
   *
   * Unicode-aware: the placeholder name can include Romanian letters
   * (`orașName`, `cetățean`, etc.). ASCII `\w` would skip those keys
   * and leave the raw placeholder in the rendered copy. Codex P2 absorb.
   */
  applyPlaceholders(template: string, vars: CopywriterPlaceholders): string {
    if (!template) return '';
    return template.replace(/\{([\p{L}\p{N}_]+)\}/gu, (_, name) => {
      const v = vars[name];
      return typeof v === 'string' ? v : `{${name}}`;
    });
  }
}
