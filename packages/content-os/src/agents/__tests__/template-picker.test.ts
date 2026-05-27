import { describe, expect, it } from 'vitest';
import {
  TemplatePickerAgent,
  type PickInput,
  type TemplateRow,
  type TemplatesRepository,
} from '../template-picker';

const baseRow = (overrides: Partial<TemplateRow>): TemplateRow => ({
  id: 'id-' + Math.random().toString(36).slice(2, 8),
  business_type: 'pizza',
  persona: 'modern',
  goal: 'awareness',
  pillar: 'promo',
  format: 'reel_ig',
  body_template: { hook_template: 'Hook', body_template: 'Body', cta_template: 'CTA' },
  performance: {},
  is_active: true,
  created_by: 'seed',
  ...overrides,
});

class FakeRepo implements TemplatesRepository {
  constructor(private readonly rows: TemplateRow[]) {}

  async findByExactKey(input: PickInput): Promise<TemplateRow | null> {
    return (
      this.rows.find(
        (r) =>
          r.business_type === input.businessType &&
          r.persona === input.persona &&
          r.goal === input.goal &&
          r.pillar === input.pillar &&
          r.format === input.format,
      ) ?? null
    );
  }

  async findByPartial(input: Partial<PickInput>): Promise<TemplateRow[]> {
    return this.rows.filter((r) =>
      (input.businessType === undefined || r.business_type === input.businessType) &&
      (input.persona === undefined || r.persona === input.persona) &&
      (input.goal === undefined || r.goal === input.goal) &&
      (input.pillar === undefined || r.pillar === input.pillar) &&
      (input.format === undefined || r.format === input.format),
    );
  }
}

describe('TemplatePickerAgent', () => {
  it('returns null when nothing matches even generic fallback', async () => {
    const agent = new TemplatePickerAgent(new FakeRepo([]));
    expect(
      await agent.pick({
        businessType: 'pizza',
        persona: 'modern',
        goal: 'awareness',
        pillar: 'promo',
        format: 'reel_ig',
      }),
    ).toBeNull();
  });

  it('returns exact match with confidence 1.0', async () => {
    const exact = baseRow({ id: 'exact' });
    const noise = baseRow({ id: 'noise', business_type: 'burger' });
    const agent = new TemplatePickerAgent(new FakeRepo([noise, exact]));

    const result = await agent.pick({
      businessType: 'pizza',
      persona: 'modern',
      goal: 'awareness',
      pillar: 'promo',
      format: 'reel_ig',
    });
    expect(result?.template.id).toBe('exact');
    expect(result?.confidence).toBe(1.0);
    expect(result?.matchKind).toBe('exact');
  });

  it('falls back to persona-loose when exact misses', async () => {
    const loose = baseRow({ id: 'arhaic-but-pizza', persona: 'arhaic' });
    const agent = new TemplatePickerAgent(new FakeRepo([loose]));
    const result = await agent.pick({
      businessType: 'pizza',
      persona: 'modern',
      goal: 'awareness',
      pillar: 'promo',
      format: 'reel_ig',
    });
    expect(result?.template.id).toBe('arhaic-but-pizza');
    expect(result?.matchKind).toBe('persona_loose');
    expect(result?.confidence).toBe(0.75);
  });

  it('falls back to generic for entirely unknown combos', async () => {
    const generic = baseRow({
      id: 'generic-fallback',
      business_type: 'general',
      persona: 'modern',
      goal: 'awareness',
      pillar: 'event',
      format: 'reel_ig',
    });
    const agent = new TemplatePickerAgent(new FakeRepo([generic]));
    const result = await agent.pick({
      businessType: 'sushi',
      persona: 'tehnic',
      goal: 'retention',
      pillar: 'flash_sale',
      format: 'reel_ig',
    });
    expect(result?.template.id).toBe('generic-fallback');
    expect(result?.matchKind).toBe('generic');
    expect(result?.confidence).toBe(0.2);
  });
});
