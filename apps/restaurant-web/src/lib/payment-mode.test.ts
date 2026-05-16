import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolvePaymentSurface, readPaymentMode } from './payment-mode';

describe('payment-mode helpers', () => {
  const originalFlag = process.env.PSP_TENANT_TOGGLE_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.PSP_TENANT_TOGGLE_ENABLED;
    else process.env.PSP_TENANT_TOGGLE_ENABLED = originalFlag;
  });

  describe('readPaymentMode', () => {
    it('returns null for null / missing / unknown shapes', () => {
      expect(readPaymentMode(null)).toBeNull();
      expect(readPaymentMode({})).toBeNull();
      expect(readPaymentMode({ payments: {} })).toBeNull();
      expect(readPaymentMode({ payments: { mode: 'bogus' } })).toBeNull();
      expect(readPaymentMode({ payments: { mode: 42 } })).toBeNull();
    });
    it('returns the parsed mode when valid', () => {
      expect(readPaymentMode({ payments: { mode: 'cod_only' } })).toBe('cod_only');
      expect(readPaymentMode({ payments: { mode: 'card_test' } })).toBe('card_test');
      expect(readPaymentMode({ payments: { mode: 'card_live' } })).toBe('card_live');
    });
  });

  describe('resolvePaymentSurface — feature flag OFF (legacy)', () => {
    beforeEach(() => {
      delete process.env.PSP_TENANT_TOGGLE_ENABLED;
    });
    it('treats CARD as always enabled and reads cod_enabled boolean', () => {
      const r = resolvePaymentSurface({ cod_enabled: true });
      expect(r.cardEnabled).toBe(true);
      expect(r.codEnabled).toBe(true);
      expect(r.showTestBanner).toBe(false);
      expect(r.mode).toBe('card_live');
    });
    it('ignores payments.mode when flag is off', () => {
      const r = resolvePaymentSurface({ payments: { mode: 'cod_only' }, cod_enabled: false });
      expect(r.cardEnabled).toBe(true);
      expect(r.codEnabled).toBe(false);
    });
  });

  describe('resolvePaymentSurface — feature flag ON', () => {
    beforeEach(() => {
      process.env.PSP_TENANT_TOGGLE_ENABLED = 'true';
    });
    it('cod_only: only COD enabled, no test banner', () => {
      const r = resolvePaymentSurface({ payments: { mode: 'cod_only' } });
      expect(r.mode).toBe('cod_only');
      expect(r.cardEnabled).toBe(false);
      expect(r.codEnabled).toBe(true);
      expect(r.showTestBanner).toBe(false);
    });
    it('card_test: CARD enabled, banner visible, COD follows cod_enabled', () => {
      const r = resolvePaymentSurface({
        payments: { mode: 'card_test' },
        cod_enabled: true,
      });
      expect(r.mode).toBe('card_test');
      expect(r.cardEnabled).toBe(true);
      expect(r.codEnabled).toBe(true);
      expect(r.showTestBanner).toBe(true);
    });
    it('card_live: CARD enabled, no banner', () => {
      const r = resolvePaymentSurface({ payments: { mode: 'card_live' } });
      expect(r.mode).toBe('card_live');
      expect(r.cardEnabled).toBe(true);
      expect(r.codEnabled).toBe(false);
      expect(r.showTestBanner).toBe(false);
    });
    it('defaults to cod_only when mode is missing', () => {
      const r = resolvePaymentSurface({});
      expect(r.mode).toBe('cod_only');
      expect(r.cardEnabled).toBe(false);
      expect(r.codEnabled).toBe(true);
    });
  });
});
