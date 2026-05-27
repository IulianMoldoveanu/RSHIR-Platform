import { describe, expect, it } from 'vitest';
import { VisualDirectorAgent } from '../visual-director';
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
  visual: { palette: ['#FF0000', '#FFFFFF'] },
  legal: null,
  competitors: [],
  monthlyBudgetCents: 5000,
  preferredMessaging: 'whatsapp',
};

const agent = new VisualDirectorAgent();

describe('VisualDirectorAgent.build', () => {
  it('uses 9:16 for vertical video formats', () => {
    const out = agent.build({
      brand: baseBrand,
      format: 'video_tiktok',
      copyHook: 'Test',
    });
    expect(out.aspectRatio).toBe('9:16');
    expect(out.durationSec).toBeGreaterThan(0);
  });

  it('uses 1:1 for static and carousel formats', () => {
    expect(agent.build({ brand: baseBrand, format: 'static_ig', copyHook: 'h' }).aspectRatio).toBe('1:1');
    expect(agent.build({ brand: baseBrand, format: 'carousel_fb', copyHook: 'h' }).aspectRatio).toBe('1:1');
  });

  it('zero duration for static formats', () => {
    expect(agent.build({ brand: baseBrand, format: 'static_ig', copyHook: 'h' }).durationSec).toBe(0);
    expect(agent.build({ brand: baseBrand, format: 'x_post', copyHook: 'h' }).durationSec).toBe(0);
  });

  it('prefers template visual brief when provided', () => {
    const out = agent.build({
      brand: baseBrand,
      format: 'reel_ig',
      copyHook: 'Hook',
      visualBriefFromTemplate: 'Top-down pizza shot, basil falling',
    });
    expect(out.prompt).toContain('Top-down pizza shot');
  });

  it('synthesizes from hook when no template provided', () => {
    const out = agent.build({
      brand: baseBrand,
      format: 'reel_ig',
      copyHook: 'Pizza pentru cina de duminică',
    });
    // Synthesised prompt embeds the hook verbatim inside the "Hook on screen" clause.
    expect(out.prompt).toContain('Pizza pentru cina de duminică');
  });

  it('emits voiceover when hook fits speech pacing', () => {
    const out = agent.build({
      brand: baseBrand,
      format: 'video_tiktok',
      copyHook: 'Pizza la 25 lei',
    });
    expect(out.voiceoverText).toBe('Pizza la 25 lei');
  });

  it('skips voiceover for static formats', () => {
    const out = agent.build({
      brand: baseBrand,
      format: 'static_ig',
      copyHook: 'Short',
    });
    expect(out.voiceoverText).toBeUndefined();
  });

  it('shot list has 3 shots for video formats', () => {
    const out = agent.build({
      brand: baseBrand,
      format: 'reel_ig',
      copyHook: 'h',
    });
    expect(out.shotList).toHaveLength(3);
    expect(out.shotList[0].type).toBe('close_up');
    expect(out.shotList[2].subject).toContain('call-to-action');
  });

  it('shot list is single composition for static', () => {
    const out = agent.build({
      brand: baseBrand,
      format: 'static_fb',
      copyHook: 'h',
    });
    expect(out.shotList).toHaveLength(1);
  });

  it('reflects tone in style tags', () => {
    expect(
      agent.build({ brand: baseBrand, format: 'reel_ig', copyHook: 'h' }).styleTags,
    ).toContain('warm_lighting'); // amical tone

    const profesionalBrand = { ...baseBrand, voice: { tone: 'profesional' as const } };
    expect(
      agent.build({ brand: profesionalBrand, format: 'reel_ig', copyHook: 'h' }).styleTags,
    ).toContain('clean');
  });

  it('includes brand palette in prompt when provided', () => {
    const out = agent.build({ brand: baseBrand, format: 'reel_ig', copyHook: 'h' });
    expect(out.prompt).toContain('#FF0000');
  });
});
