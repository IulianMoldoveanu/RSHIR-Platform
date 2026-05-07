// QW7 (UIUX audit 2026-05-08) — unit tests for the saved-address cache.
//
// Vitest runs in Node (no DOM), so we stub `globalThis.window.localStorage`
// with a plain Map-backed implementation per test. Tenant-scoped keying +
// validation guards are the actual logic; the localStorage backend is just
// the storage layer.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearSavedAddress,
  readSavedAddress,
  writeSavedAddress,
} from './saved-address';

class MemStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';

beforeEach(() => {
  // Build a window stub that survives across reads/writes inside one test.
  const storage = new MemStorage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = { localStorage: storage };
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window;
});

describe('readSavedAddress', () => {
  it('returns null when nothing has been written', () => {
    expect(readSavedAddress(TENANT_A)).toBeNull();
  });

  it('round-trips a written address', () => {
    writeSavedAddress(TENANT_A, {
      line1: 'Strada Republicii 12',
      city: 'Brașov',
      postalCode: '500001',
    });
    expect(readSavedAddress(TENANT_A)).toEqual({
      line1: 'Strada Republicii 12',
      city: 'Brașov',
      postalCode: '500001',
    });
  });

  it('isolates by tenant', () => {
    writeSavedAddress(TENANT_A, {
      line1: 'A1',
      city: 'A-City',
      postalCode: '111111',
    });
    expect(readSavedAddress(TENANT_B)).toBeNull();
  });

  it('returns null when tenantId is empty', () => {
    expect(readSavedAddress('')).toBeNull();
  });

  it('rejects partial payloads (missing line1)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.localStorage.setItem(
      'hir-last-address:' + TENANT_A,
      JSON.stringify({ city: 'X', postalCode: '0' }),
    );
    expect(readSavedAddress(TENANT_A)).toBeNull();
  });

  it('rejects empty line1/city after trim', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.localStorage.setItem(
      'hir-last-address:' + TENANT_A,
      JSON.stringify({ line1: '   ', city: '', postalCode: '0' }),
    );
    expect(readSavedAddress(TENANT_A)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.localStorage.setItem(
      'hir-last-address:' + TENANT_A,
      'not json',
    );
    expect(readSavedAddress(TENANT_A)).toBeNull();
  });
});

describe('writeSavedAddress', () => {
  it('skips when line1 is blank', () => {
    writeSavedAddress(TENANT_A, { line1: '   ', city: 'X', postalCode: '0' });
    expect(readSavedAddress(TENANT_A)).toBeNull();
  });

  it('trims fields before persisting', () => {
    writeSavedAddress(TENANT_A, {
      line1: '  A1  ',
      city: '  Brașov ',
      postalCode: ' 500001 ',
    });
    expect(readSavedAddress(TENANT_A)).toEqual({
      line1: 'A1',
      city: 'Brașov',
      postalCode: '500001',
    });
  });
});

describe('clearSavedAddress', () => {
  it('removes the persisted address', () => {
    writeSavedAddress(TENANT_A, {
      line1: 'A1',
      city: 'Brașov',
      postalCode: '500001',
    });
    clearSavedAddress(TENANT_A);
    expect(readSavedAddress(TENANT_A)).toBeNull();
  });

  it('does not throw when no address is stored', () => {
    expect(() => clearSavedAddress(TENANT_A)).not.toThrow();
  });
});

describe('SSR safety', () => {
  it('readSavedAddress returns null when window is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    expect(readSavedAddress(TENANT_A)).toBeNull();
  });

  it('writeSavedAddress is a no-op when window is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    expect(() =>
      writeSavedAddress(TENANT_A, {
        line1: 'A1',
        city: 'Brașov',
        postalCode: '500001',
      }),
    ).not.toThrow();
  });
});

describe('iframe / hardened-privacy safety (Codex review #347 P2)', () => {
  it('readSavedAddress returns null when window.localStorage throws SecurityError', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      get localStorage(): Storage {
        const err = new Error('Access denied for this document');
        err.name = 'SecurityError';
        throw err;
      },
    };
    expect(readSavedAddress(TENANT_A)).toBeNull();
  });

  it('writeSavedAddress is a no-op when accessing localStorage throws', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      get localStorage(): Storage {
        const err = new Error('blocked');
        err.name = 'SecurityError';
        throw err;
      },
    };
    expect(() =>
      writeSavedAddress(TENANT_A, {
        line1: 'A1',
        city: 'Brașov',
        postalCode: '500001',
      }),
    ).not.toThrow();
  });

  it('clearSavedAddress is a no-op when accessing localStorage throws', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      get localStorage(): Storage {
        const err = new Error('blocked');
        err.name = 'SecurityError';
        throw err;
      },
    };
    expect(() => clearSavedAddress(TENANT_A)).not.toThrow();
  });
});
