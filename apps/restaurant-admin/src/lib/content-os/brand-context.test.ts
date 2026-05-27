// Tests for the brand-context DB→BrandContext mapper. Defensive against
// missing JSONB fields (voice/visual) so a freshly-inserted brand without
// voice settings doesn't crash the generate-tick pipeline.

import { describe, expect, it } from 'vitest';
import { rowToBrandContext } from './brand-context';

describe('rowToBrandContext', () => {
  it('maps a full row faithfully', () => {
    const ctx = rowToBrandContext({
      id: 'brand-1',
      tenant_id: 'tenant-1',
      brand_code: 'demo',
      kind: 'TENANT_SAAS',
      business_type: 'pizza',
      display_name: 'Demo Pizza',
      tier: 'pro',
      voice_json: { tone: 'amical', forbiddenTerms: ['stack', 'platformă'] },
      visual_json: { palette: ['#FF6B35', '#FFFFFF'] },
      legal_json: { gdpr: true },
      competitors: ['Glovo'],
      monthly_budget_cents: 5000,
      preferred_messaging: 'whatsapp',
    });
    expect(ctx.id).toBe('brand-1');
    expect(ctx.kind).toBe('TENANT_SAAS');
    expect(ctx.tier).toBe('pro');
    expect(ctx.voice.tone).toBe('amical');
    expect(ctx.voice.forbiddenTerms).toEqual(['stack', 'platformă']);
    expect(ctx.visual.palette).toEqual(['#FF6B35', '#FFFFFF']);
    expect(ctx.competitors).toEqual(['Glovo']);
    expect(ctx.preferredMessaging).toBe('whatsapp');
  });

  it('handles null jsonb fields without throwing', () => {
    const ctx = rowToBrandContext({
      id: 'brand-2',
      tenant_id: null,
      brand_code: 'hir',
      kind: 'HIR_INTERNAL',
      business_type: null,
      display_name: 'HIR',
      tier: 'enterprise',
      voice_json: null,
      visual_json: null,
      legal_json: null,
      competitors: null,
      monthly_budget_cents: 0,
      preferred_messaging: 'telegram',
    });
    expect(ctx.tenantId).toBeNull();
    expect(ctx.voice).toEqual({
      tone: undefined,
      forbiddenTerms: undefined,
      personas: undefined,
      doNots: undefined,
      extra: undefined,
    });
    expect(ctx.competitors).toEqual([]);
    expect(ctx.preferredMessaging).toBe('telegram');
  });

  it('defaults invalid tier to brand input (no silent munging)', () => {
    // The mapper trusts upstream — invalid tier ends up cast to Tier. If
    // the API ever gets a bad tier it will surface through agent
    // assertions, not a silent mapper override.
    const ctx = rowToBrandContext({
      id: 'brand-3',
      tenant_id: 't',
      brand_code: 'x',
      kind: 'TENANT_SAAS',
      business_type: 'general',
      display_name: 'X',
      tier: 'mystery',
      voice_json: null,
      visual_json: null,
      legal_json: null,
      competitors: [],
      monthly_budget_cents: 5000,
      preferred_messaging: 'whatsapp',
    });
    expect(ctx.tier).toBe('mystery');
  });
});
