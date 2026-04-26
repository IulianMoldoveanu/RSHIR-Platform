import { z } from 'zod';

const uuid = z.string().uuid();

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const categoryUpdateSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(80),
});

export const categoryReorderSchema = z.object({
  ids: z.array(uuid).min(1),
});

export const categoryToggleSchema = z.object({
  id: uuid,
  is_active: z.boolean(),
});

export const categoryDeleteSchema = z.object({ id: uuid });

const tagsSchema = z
  .string()
  .max(500)
  .transform((s) =>
    s
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  );

export const itemCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  price_ron: z.coerce.number().nonnegative().max(100000),
  category_id: uuid,
  tags: tagsSchema.optional(),
  is_available: z
    .union([z.literal('on'), z.literal('off'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'on'),
});

export const itemUpdateSchema = itemCreateSchema.extend({ id: uuid });

export const itemDeleteSchema = z.object({ id: uuid });

export const itemAvailabilitySchema = z.object({
  id: uuid,
  is_available: z.coerce.boolean(),
});

export const itemBulkAvailabilitySchema = z.object({
  ids: z.array(uuid).min(1),
  is_available: z.coerce.boolean(),
});

export const itemSoldOutSchema = z.object({ id: uuid });

export const modifierCreateSchema = z.object({
  item_id: uuid,
  name: z.string().trim().min(1).max(80),
  price_delta_ron: z.coerce.number().min(-100000).max(100000),
  // Optional: attach to an existing group on create. Empty string ignored
  // (FormData can't easily express "null", so the action treats unset / ''
  // as "ungrouped optional").
  group_id: z.union([uuid, z.literal('')]).optional(),
});

export const modifierUpdateSchema = modifierCreateSchema.extend({ id: uuid }).omit({ item_id: true });

export const modifierDeleteSchema = z.object({ id: uuid });

// Modifier groups (size variants, required choices, etc.).
export const modifierGroupCreateSchema = z.object({
  item_id: uuid,
  name: z.string().trim().min(1).max(80),
  is_required: z
    .union([z.literal('on'), z.literal('off'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'on'),
  select_min: z.coerce.number().int().min(0).max(20),
  select_max: z
    .union([z.coerce.number().int().min(1).max(20), z.literal(''), z.literal('null')])
    .optional()
    .transform((v) => (v === '' || v === 'null' || v === undefined ? null : v)),
  sort_order: z.coerce.number().int().min(0).max(1000).optional().default(0),
});

export const modifierGroupUpdateSchema = modifierGroupCreateSchema
  .extend({ id: uuid })
  .omit({ item_id: true });

export const modifierGroupDeleteSchema = z.object({ id: uuid });

const csvRowSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().default(''),
  price: z.coerce.number().nonnegative(),
  category: z.string().trim().min(1),
});

export const csvImportSchema = z.object({
  rows: z.array(csvRowSchema).min(1).max(500),
});

export type CsvRow = z.infer<typeof csvRowSchema>;
