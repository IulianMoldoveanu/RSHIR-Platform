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

// Optional integer field that arrives as either an empty string (unset
// FormData input), a numeric string, or undefined. Empty/undefined → null;
// otherwise validated as int in [min, max].
function optionalIntField(min: number, max: number) {
  return z
    .union([z.literal(''), z.string(), z.number(), z.undefined(), z.null()])
    .transform((v) => {
      if (v === '' || v === undefined || v === null) return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    })
    .refine((n) => n === null || (Number.isInteger(n) && n >= min && n <= max), {
      message: `Trebuie să fie un întreg între ${min} și ${max}.`,
    });
}

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
  // 0–240 min, NULL means "no badge".
  prep_minutes: optionalIntField(0, 240),
  // 1–4999 g, NULL means "no per-100g line".
  serving_size_grams: optionalIntField(1, 4999),
  // Free-text override, max 60 chars; '' → null.
  serving_size_label: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((s) => (s && s.length > 0 ? s : null)),
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
