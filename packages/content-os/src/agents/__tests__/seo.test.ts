import { describe, expect, it } from 'vitest';
import { SeoAgent } from '../seo';
import type { BrandContext } from '../../types';

const baseBrand: BrandContext = {
  id: 'b1',
  tenantId: 't1',
  brandCode: 'TEST',
  kind: 'TENANT_SAAS',
  businessType: 'pizza',
  displayName: 'La Mama Pizza',
  tier: 'pro',
  voice: { tone: 'amical' },
  visual: {},
  legal: null,
  competitors: [],
  monthlyBudgetCents: 5000,
  preferredMessaging: 'whatsapp',
};

const agent = new SeoAgent();

describe('SeoAgent.build', () => {
  it('truncates meta title to 60 chars max', () => {
    const longHook = 'A'.repeat(80);
    const out = agent.build({
      brand: baseBrand,
      copyHook: longHook,
      format: 'reel_ig',
    });
    expect(out.metaTitle.length).toBeLessThanOrEqual(60);
  });

  it('appends brand suffix when room available', () => {
    const out = agent.build({
      brand: baseBrand,
      copyHook: 'Scurt hook',
      format: 'reel_ig',
    });
    expect(out.metaTitle).toContain('La Mama Pizza');
  });

  it('truncates meta description to 155 chars max', () => {
    const longBody = 'X'.repeat(300);
    const out = agent.build({
      brand: baseBrand,
      copyHook: 'h',
      copyBody: longBody,
      format: 'reel_ig',
    });
    expect(out.metaDescription.length).toBeLessThanOrEqual(155);
  });

  it('caps hashtags by channel — TikTok 5, Instagram 10', () => {
    const tiktok = agent.build({
      brand: baseBrand,
      copyHook: 'h',
      format: 'reel_ig',
      channel: 'tiktok',
      keywordSeeds: Array.from({ length: 20 }, (_, i) => `seed${i}`),
    });
    expect(tiktok.hashtags.length).toBeLessThanOrEqual(5);

    const ig = agent.build({
      brand: baseBrand,
      copyHook: 'h',
      format: 'reel_ig',
      channel: 'instagram',
      keywordSeeds: Array.from({ length: 20 }, (_, i) => `seed${i}`),
    });
    expect(ig.hashtags.length).toBeLessThanOrEqual(10);
  });

  it('schemaOrg populated only for landing-page format', () => {
    const social = agent.build({ brand: baseBrand, copyHook: 'h', format: 'reel_ig' });
    expect(social.schemaOrg).toBeUndefined();

    const lp = agent.build({ brand: baseBrand, copyHook: 'h', format: 'meta_title' });
    expect(lp.schemaOrg).toBeDefined();
    expect(lp.schemaOrg?.['@type']).toBe('LocalBusiness');
  });
});

describe('SeoAgent.slugify', () => {
  it('strips Romanian diacritics', () => {
    expect(agent.slugify('Brașov')).toBe('brasov');
    expect(agent.slugify('Pâine')).toBe('paine');
    expect(agent.slugify('Țară')).toBe('tara');
  });

  it('strips non-alphanumeric and collapses to ASCII', () => {
    expect(agent.slugify('La Mama Pizza!')).toBe('lamamapizza');
  });

  it('clamps to 30 chars', () => {
    expect(agent.slugify('X'.repeat(100)).length).toBe(30);
  });
});

describe('SeoAgent.truncate', () => {
  it('returns input unchanged when short enough', () => {
    expect(agent.truncate('short', 100)).toBe('short');
  });

  it('preserves word boundary when cut > 60% of length', () => {
    const out = agent.truncate('Acesta este un text mediu lungime', 25);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(26);
  });

  it('returns empty string on null-ish input', () => {
    expect(agent.truncate('', 100)).toBe('');
  });
});
