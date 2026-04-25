import { z } from 'zod';

export const cartItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive().max(50),
});

export const addressSchema = z.object({
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  lat: z.number().refine((v) => v >= -90 && v <= 90, 'invalid lat'),
  lng: z.number().refine((v) => v >= -180 && v <= 180, 'invalid lng'),
});

export const customerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(6).max(40),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
});

export const fulfillmentSchema = z.enum(['DELIVERY', 'PICKUP']);

const promoCodeField = z
  .string()
  .trim()
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/i, 'invalid promo code')
  .optional()
  .or(z.literal(''));

export const quoteRequestSchema = z
  .object({
    items: z.array(cartItemSchema).min(1).max(50),
    fulfillment: fulfillmentSchema.default('DELIVERY'),
    address: addressSchema.optional(),
    promoCode: promoCodeField,
  })
  .refine((v) => v.fulfillment === 'PICKUP' || v.address !== undefined, {
    message: 'address required for delivery',
    path: ['address'],
  });

export const intentRequestSchema = z
  .object({
    items: z.array(cartItemSchema).min(1).max(50),
    fulfillment: fulfillmentSchema.default('DELIVERY'),
    address: addressSchema.optional(),
    customer: customerSchema,
    notes: z.string().trim().max(500).optional().or(z.literal('')),
    promoCode: promoCodeField,
  })
  .refine((v) => v.fulfillment === 'PICKUP' || v.address !== undefined, {
    message: 'address required for delivery',
    path: ['address'],
  });

export const confirmRequestSchema = z.object({
  orderId: z.string().uuid(),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type Fulfillment = z.infer<typeof fulfillmentSchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type IntentRequest = z.infer<typeof intentRequestSchema>;
