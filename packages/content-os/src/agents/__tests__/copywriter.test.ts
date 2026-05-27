import { describe, expect, it } from 'vitest';
import { CopywriterAgent } from '../copywriter';
import type { BrandContext } from '../../types';

const baseBrand: BrandContext = {
  id: 'b1',
  tenantId: 't1',
  brandCode: 'TEST',
  kind: 'TENANT_SAAS',
  businessType: 'pizza',
  displayName: 'La Mama Pizza',
  tier: 'pro',
  voice: {
    tone: 'amical',
    forbiddenTerms: ['fleet', 'subcontractor'],
    personas: ['modern'],
  },
  visual: {},
  legal: null,
  competitors: ['Glovo', 'Tazz'],
  monthlyBudgetCents: 5000,
  preferredMessaging: 'whatsapp',
};

const agent = new CopywriterAgent();

describe('CopywriterAgent.fillTemplate', () => {
  it('substitutes single placeholders', () => {
    const draft = agent.fillTemplate(
      {
        hook_template: '{businessName} are pizza',
        body_template: '{itemName} la {price} RON',
        cta_template: 'Sună {phoneNumber}',
        hashtags: ['#{businessName}'],
      },
      {
        businessName: 'La Mama Pizza',
        itemName: 'Margherita',
        price: '25',
        phoneNumber: '0773000000',
      },
      baseBrand,
    );
    expect(draft.hook).toBe('La Mama Pizza are pizza');
    expect(draft.body).toBe('Margherita la 25 RON');
    expect(draft.cta).toBe('Sună 0773000000');
    expect(draft.hashtags).toEqual(['#La Mama Pizza']);
    expect(draft.fullText).toContain('La Mama Pizza are pizza');
  });

  it('leaves unknown placeholders intact', () => {
    const draft = agent.fillTemplate(
      { hook_template: '{businessName} cu {unknownVar}' },
      { businessName: 'X' },
      baseBrand,
    );
    expect(draft.hook).toBe('X cu {unknownVar}');
  });

  it('strips forbidden terms case-insensitive', () => {
    const draft = agent.fillTemplate(
      {
        hook_template: 'Our fleet of cars',
        body_template: 'Subcontractor model',
      },
      { businessName: 'X' },
      baseBrand,
    );
    expect(draft.hook).not.toMatch(/fleet/i);
    expect(draft.body).not.toMatch(/subcontractor/i);
  });
});

describe('CopywriterAgent.buildSystemPrompt', () => {
  it('emits Romanian copywriter persona with brand voice', () => {
    const prompt = agent.buildSystemPrompt({
      brand: baseBrand,
      persona: 'modern',
      pillar: 'promo',
      format: 'reel_ig',
    });
    expect(prompt).toContain('La Mama Pizza');
    expect(prompt).toContain('reel_ig');
    expect(prompt).toContain('Persona audiență: modern');
    expect(prompt).toContain('Pillar: promo');
    expect(prompt).toContain('patroane'); // amical tone hint
  });

  it('lists forbidden terms verbatim', () => {
    const prompt = agent.buildSystemPrompt({
      brand: baseBrand,
      persona: 'modern',
      pillar: 'promo',
      format: 'reel_ig',
    });
    expect(prompt).toContain('"fleet"');
    expect(prompt).toContain('"subcontractor"');
  });

  it('mentions competitors when present', () => {
    const prompt = agent.buildSystemPrompt({
      brand: baseBrand,
      persona: 'modern',
      pillar: 'promo',
      format: 'reel_ig',
    });
    expect(prompt).toContain('Glovo');
    expect(prompt).toContain('Tazz');
  });

  it('emits strict JSON format hint', () => {
    const prompt = agent.buildSystemPrompt({
      brand: baseBrand,
      persona: 'modern',
      pillar: 'promo',
      format: 'reel_ig',
    });
    expect(prompt).toContain('STRICT JSON');
    expect(prompt).toContain('"hook"');
    expect(prompt).toContain('"hashtags"');
  });
});

describe('CopywriterAgent.applyPlaceholders', () => {
  it('handles repeated placeholders', () => {
    expect(
      agent.applyPlaceholders('{x} and {x}', { x: 'Y', businessName: 'B' }),
    ).toBe('Y and Y');
  });

  it('handles empty template', () => {
    expect(agent.applyPlaceholders('', { businessName: 'X' })).toBe('');
  });
});

describe('CopywriterAgent.sanitizeForbidden', () => {
  it('handles empty forbidden list', () => {
    expect(agent.sanitizeForbidden('fleet stays', [])).toBe('fleet stays');
  });
});
