import { describe, it, expect } from 'vitest';
import { getLegalAdapter, SUPPORTED_LEGAL_COUNTRIES } from './index';
import { LEGAL_ENTITY } from '../legal-entity';

describe('getLegalAdapter', () => {
  it('returns RO adapter for "RO"', () => {
    const adapter = getLegalAdapter('RO');
    expect(adapter.entity).toBe(LEGAL_ENTITY);
    expect(adapter.consumerProtectionAgency).toBe('ANPC');
    expect(adapter.consumerProtectionUrl).toBe('https://anpc.ro');
  });

  it('is case-insensitive', () => {
    const lower = getLegalAdapter('ro');
    const upper = getLegalAdapter('RO');
    expect(lower).toBe(upper);
  });

  it('falls back to RO for unknown country codes', () => {
    const adapter = getLegalAdapter('XX');
    expect(adapter.entity).toBe(LEGAL_ENTITY);
  });

  it('defaults to RO when no argument is passed', () => {
    const adapter = getLegalAdapter();
    expect(adapter.entity).toBe(LEGAL_ENTITY);
  });

  it('SUPPORTED_LEGAL_COUNTRIES includes RO', () => {
    expect(SUPPORTED_LEGAL_COUNTRIES).toContain('RO');
  });
});
