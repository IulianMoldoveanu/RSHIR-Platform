import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from '../src/lib/display-pin';

describe('display auth PIN hashing', () => {
  it('verifyPin returns true for the correct PIN', async () => {
    const hash = await hashPin('5678');
    expect(await verifyPin('5678', hash)).toBe(true);
  });

  it('verifyPin returns false for a wrong PIN', async () => {
    const hash = await hashPin('5678');
    expect(await verifyPin('9999', hash)).toBe(false);
  });

  it('verifyPin returns false for the old hardcoded PIN 1234 when tenant has a different PIN', async () => {
    const hash = await hashPin('9876');
    expect(await verifyPin('1234', hash)).toBe(false);
  });

  it('verifyPin returns false for a malformed hash string', async () => {
    expect(await verifyPin('1234', 'notahash')).toBe(false);
    expect(await verifyPin('1234', 'scrypt:only_two_parts')).toBe(false);
    expect(await verifyPin('1234', '')).toBe(false);
  });

  it('produces a different hash on each call (salted)', async () => {
    const h1 = await hashPin('1234');
    const h2 = await hashPin('1234');
    expect(h1).not.toBe(h2);
  });

  it('hash format is scrypt:<salt_hex>:<hash_hex>', async () => {
    const hash = await hashPin('abcd');
    const parts = hash.split(':');
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // 16 bytes hex
    expect(parts[2]).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
  });
});
