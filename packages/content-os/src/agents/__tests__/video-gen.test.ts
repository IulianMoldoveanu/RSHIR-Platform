import { describe, expect, it } from 'vitest';
import { VideoGenAgent, CapExceededError, type CapChecker } from '../video-gen';
import type { VisualPrompt } from '../visual-director';
import type { BrandContext } from '../../types';

const baseBrand: BrandContext = {
  id: 'b1',
  tenantId: 't1',
  brandCode: 'TEST',
  kind: 'TENANT_SAAS',
  businessType: 'pizza',
  displayName: 'La Mama Pizza',
  tier: 'pro',
  voice: {},
  visual: {},
  legal: null,
  competitors: [],
  monthlyBudgetCents: 5000,
  preferredMessaging: 'whatsapp',
};

const samplePrompt: VisualPrompt = {
  prompt: 'Pizza hero shot',
  shotList: [
    { type: 'close_up', subject: 'pizza', motion: 'zoom_in', durationSec: 5 },
  ],
  aspectRatio: '9:16',
  durationSec: 18,
  voiceoverLanguage: 'ro',
  styleTags: ['cinematic'],
};

const agent = new VideoGenAgent();

describe('VideoGenAgent.estimateCostCents', () => {
  it('uses default mock provider on basic tier (cost 0)', () => {
    const out = agent.estimateCostCents({
      brand: { ...baseBrand, tier: 'basic' },
      prompt: samplePrompt,
      clientReferenceId: 'draft-1',
    });
    expect(out.providerName).toBe('mock');
    expect(out.estimateCents).toBe(0);
    expect(out.durationSec).toBe(18);
  });

  it('respects provider override', () => {
    const out = agent.estimateCostCents({
      brand: baseBrand,
      prompt: samplePrompt,
      clientReferenceId: 'draft-1',
      providerOverride: 'mock',
    });
    expect(out.providerName).toBe('mock');
  });
});

describe('VideoGenAgent.generate', () => {
  it('returns succeeded job from mock provider', async () => {
    const out = await agent.generate({
      brand: baseBrand,
      prompt: samplePrompt,
      clientReferenceId: 'draft-1',
    });
    expect(out.status).toBe('succeeded');
    expect(out.videoUrl).toContain('https://mock.content-os.local/');
    expect(out.providerName).toBe('mock');
    expect(out.durationSec).toBe(18);
  });

  it('is deterministic for same input fingerprint', async () => {
    const a = await agent.generate({
      brand: baseBrand,
      prompt: samplePrompt,
      clientReferenceId: 'same-ref',
    });
    const b = await agent.generate({
      brand: baseBrand,
      prompt: samplePrompt,
      clientReferenceId: 'same-ref',
    });
    expect(a.videoUrl).toBe(b.videoUrl);
    expect(a.providerJobId).toBe(b.providerJobId);
  });

  it('returns noop for zero-duration format gracefully', async () => {
    const staticPrompt: VisualPrompt = { ...samplePrompt, durationSec: 0 };
    const out = await agent.generate({
      brand: baseBrand,
      prompt: staticPrompt,
      clientReferenceId: 'static-draft',
    });
    expect(out.status).toBe('succeeded');
    expect(out.videoUrl).toBeUndefined();
    expect(out.durationSec).toBe(0);
  });

  it('runs the cap-checker and proceeds when allowed', async () => {
    let called = 0;
    const checker: CapChecker = async (tenantId) => {
      called++;
      expect(tenantId).toBe('t1');
      return { allowed: true, used: 1, cap: 3 };
    };
    const out = await agent.generate({
      brand: baseBrand,
      prompt: samplePrompt,
      clientReferenceId: 'cap-ok',
      capChecker: checker,
    });
    expect(called).toBe(1);
    expect(out.status).toBe('succeeded');
  });

  it('throws CapExceededError BEFORE calling the provider when over cap', async () => {
    const checker: CapChecker = async () => ({
      allowed: false,
      message: 'over cap',
      used: 3,
      cap: 3,
    });
    await expect(
      agent.generate({
        brand: baseBrand,
        prompt: samplePrompt,
        clientReferenceId: 'cap-blocked',
        capChecker: checker,
      }),
    ).rejects.toBeInstanceOf(CapExceededError);
  });

  it('skips the cap-checker for HIR_INTERNAL brands (tenantId null)', async () => {
    let called = 0;
    const checker: CapChecker = async () => {
      called++;
      return { allowed: false };
    };
    const hirBrand: BrandContext = { ...baseBrand, tenantId: null, kind: 'HIR_INTERNAL' };
    const out = await agent.generate({
      brand: hirBrand,
      prompt: samplePrompt,
      clientReferenceId: 'hir-internal',
      capChecker: checker,
    });
    expect(called).toBe(0);
    expect(out.status).toBe('succeeded');
  });
});
