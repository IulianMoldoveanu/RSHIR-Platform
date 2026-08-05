import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// readCustomerCookie pulls from next/headers cookies(); drive it from a
// plain map so the tests can plant arbitrary (including forged) values.
const jar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

import {
  customerCookieName,
  customerCookieValue,
  readCustomerCookie,
} from './customer-recognition';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('customer recognition cookie', () => {
  const original = process.env.CUSTOMER_COOKIE_SECRET;

  beforeEach(() => {
    jar.clear();
    process.env.CUSTOMER_COOKIE_SECRET = 'test-secret-do-not-use-in-prod';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CUSTOMER_COOKIE_SECRET;
    else process.env.CUSTOMER_COOKIE_SECRET = original;
  });

  function plant(tenantId: string, value: string) {
    jar.set(customerCookieName(tenantId), value);
  }

  it('round-trips a signed cookie', () => {
    const value = customerCookieValue(TENANT_A, CUSTOMER);
    expect(value).not.toBeNull();
    plant(TENANT_A, value!);
    expect(readCustomerCookie(TENANT_A)).toBe(CUSTOMER);
  });

  // The whole point of the change: the bare UUID used to be accepted.
  it('rejects a bare unsigned UUID (the pre-signing format)', () => {
    plant(TENANT_A, CUSTOMER);
    expect(readCustomerCookie(TENANT_A)).toBeNull();
  });

  it('rejects a wrong / truncated signature', () => {
    const value = customerCookieValue(TENANT_A, CUSTOMER)!;
    plant(TENANT_A, `${CUSTOMER}.deadbeef`);
    expect(readCustomerCookie(TENANT_A)).toBeNull();
    plant(TENANT_A, value.slice(0, -1));
    expect(readCustomerCookie(TENANT_A)).toBeNull();
  });

  it('rejects another customer id spliced onto a valid signature', () => {
    const value = customerCookieValue(TENANT_A, CUSTOMER)!;
    const signature = value.slice(value.indexOf('.') + 1);
    const otherCustomer = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    plant(TENANT_A, `${otherCustomer}.${signature}`);
    expect(readCustomerCookie(TENANT_A)).toBeNull();
  });

  // Cross-tenant replay: the signature covers tenantId, so a cookie minted on
  // tenant A is inert on tenant B even when planted under B's cookie name.
  it('rejects a cookie minted for a different tenant', () => {
    const forTenantA = customerCookieValue(TENANT_A, CUSTOMER)!;
    plant(TENANT_B, forTenantA);
    expect(readCustomerCookie(TENANT_B)).toBeNull();
  });

  it('rejects a malformed customer id even when signed', () => {
    plant(TENANT_A, `not-a-uuid.${'x'.repeat(43)}`);
    expect(readCustomerCookie(TENANT_A)).toBeNull();
  });

  it('mints nothing and recognises nobody when the secret is unset', () => {
    const value = customerCookieValue(TENANT_A, CUSTOMER)!;
    delete process.env.CUSTOMER_COOKIE_SECRET;
    expect(customerCookieValue(TENANT_A, CUSTOMER)).toBeNull();
    plant(TENANT_A, value);
    expect(readCustomerCookie(TENANT_A)).toBeNull();
  });
});
