import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  generateOtpCode,
  hashOtpCode,
  normalizeRoPhoneE164,
} from './otp';

describe('normalizeRoPhoneE164', () => {
  it('accepts a bare 9-digit mobile starting with 7', () => {
    expect(normalizeRoPhoneE164('712345678')).toBe('+40712345678');
  });
  it('strips the leading 0 prefix', () => {
    expect(normalizeRoPhoneE164('0712345678')).toBe('+40712345678');
  });
  it('strips the 40 country code prefix', () => {
    expect(normalizeRoPhoneE164('40712345678')).toBe('+40712345678');
  });
  it('strips the 0040 international prefix', () => {
    expect(normalizeRoPhoneE164('0040712345678')).toBe('+40712345678');
  });
  it('accepts +40 prefixed numbers and spaces', () => {
    expect(normalizeRoPhoneE164('+40 712 345 678')).toBe('+40712345678');
  });
  it('rejects landlines (not starting with 7)', () => {
    expect(normalizeRoPhoneE164('0212345678')).toBeNull();
  });
  it('rejects short numbers', () => {
    expect(normalizeRoPhoneE164('71234')).toBeNull();
  });
  it('rejects empty input', () => {
    expect(normalizeRoPhoneE164('')).toBeNull();
  });
});

describe('generateOtpCode', () => {
  it('returns a 6-digit zero-padded numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateOtpCode();
      expect(c).toMatch(/^\d{6}$/);
    }
  });
});

describe('hashOtpCode', () => {
  beforeEach(() => {
    process.env.RSHIR_OTP_PEPPER = 'test-pepper';
  });
  afterEach(() => {
    delete process.env.RSHIR_OTP_PEPPER;
  });
  it('returns a 64-char hex string', () => {
    expect(hashOtpCode('123456')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('is deterministic for the same input + pepper', () => {
    const a = hashOtpCode('123456');
    const b = hashOtpCode('123456');
    expect(a).toBe(b);
  });
  it('changes when pepper changes', () => {
    const a = hashOtpCode('123456');
    process.env.RSHIR_OTP_PEPPER = 'other-pepper';
    const b = hashOtpCode('123456');
    expect(a).not.toBe(b);
  });
  it('differs across distinct codes', () => {
    expect(hashOtpCode('111111')).not.toBe(hashOtpCode('222222'));
  });
});
