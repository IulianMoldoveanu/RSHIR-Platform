import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Inline the schema here so the test doesn't import server-only code.
const manualOrderSchema = z.object({
  tenantId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(80),
  customerPhone: z.string().trim().min(6).max(40),
  customerEmail: z.string().trim().email().max(200).optional().or(z.literal('')),
  fulfillmentType: z.enum(['DELIVERY', 'PICKUP']),
  dropoffAddress: z.string().trim().max(300).optional().or(z.literal('')),
  paymentMethod: z.enum(['COD', 'CARD']),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  itemsJson: z.string(),
}).refine(
  (v) => v.fulfillmentType !== 'DELIVERY' || (v.dropoffAddress ?? '').trim().length >= 3,
  { message: 'Adresa de livrare este obligatorie.', path: ['dropoffAddress'] },
);

const VALID_BASE = {
  tenantId: 'a0000000-0000-0000-0000-000000000001',
  customerName: 'Ion Popescu',
  customerPhone: '0712345678',
  customerEmail: '',
  fulfillmentType: 'DELIVERY' as const,
  dropoffAddress: 'Str. Exemplu 10',
  paymentMethod: 'COD' as const,
  notes: '',
  itemsJson: '[]',
};

describe('manualOrderSchema', () => {
  it('accepts a valid DELIVERY payload', () => {
    expect(manualOrderSchema.safeParse(VALID_BASE).success).toBe(true);
  });

  it('accepts PICKUP without dropoffAddress', () => {
    const res = manualOrderSchema.safeParse({
      ...VALID_BASE,
      fulfillmentType: 'PICKUP',
      dropoffAddress: '',
    });
    expect(res.success).toBe(true);
  });

  it('rejects DELIVERY with empty dropoffAddress', () => {
    const res = manualOrderSchema.safeParse({
      ...VALID_BASE,
      dropoffAddress: '',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.errors.map((e) => e.path.join('.'));
      expect(paths).toContain('dropoffAddress');
    }
  });

  it('rejects missing customerName', () => {
    const res = manualOrderSchema.safeParse({ ...VALID_BASE, customerName: '' });
    expect(res.success).toBe(false);
  });

  it('rejects phone shorter than 6 chars', () => {
    const res = manualOrderSchema.safeParse({ ...VALID_BASE, customerPhone: '0712' });
    expect(res.success).toBe(false);
  });

  it('rejects invalid tenantId (not uuid)', () => {
    const res = manualOrderSchema.safeParse({ ...VALID_BASE, tenantId: 'not-a-uuid' });
    expect(res.success).toBe(false);
  });

  it('rejects invalid email when provided', () => {
    const res = manualOrderSchema.safeParse({ ...VALID_BASE, customerEmail: 'bad-email' });
    expect(res.success).toBe(false);
  });

  it('accepts valid optional email', () => {
    const res = manualOrderSchema.safeParse({ ...VALID_BASE, customerEmail: 'test@example.com' });
    expect(res.success).toBe(true);
  });

  it('rejects invalid fulfillmentType', () => {
    const res = manualOrderSchema.safeParse({ ...VALID_BASE, fulfillmentType: 'DRONE' });
    expect(res.success).toBe(false);
  });

  it('rejects invalid paymentMethod', () => {
    const res = manualOrderSchema.safeParse({ ...VALID_BASE, paymentMethod: 'CRYPTO' });
    expect(res.success).toBe(false);
  });
});
