// Hepi action registry — the WHITELIST of things Hepi may do.
//
// Hepi never runs arbitrary SQL or code. Every action it can take is a named
// entry here, each mapping to an EXISTING audited server action (which re-checks
// platform-admin + writes audit_log). Adding more of "the whole admin catalog"
// = adding entries here, not changing the engine. The engine (hepi route +
// /execute) only knows: validate params with `schema`, then call `execute`.
//
// Stage 1 batch: cities (activate / deactivate / bulk capitals) + tenant
// (suspend / reactivate). All reuse the audited actions shipped in #871 / RSHIR.

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { setCityActive, activateCountyCapitals } from '@/app/dashboard/admin/cities/actions';
import { setTenantStatus } from '@/app/dashboard/admin/tenants/actions';

export type HepiActionResult = { ok: boolean; message: string };

export type HepiActionDef = {
  id: string;
  label: string;
  risk: 'low' | 'high';
  /** Anthropic tool description. */
  description: string;
  /** Anthropic tool input_schema (JSON schema). */
  inputSchema: Record<string, unknown>;
  /** Runtime validation of the (possibly model-supplied) params. */
  schema: z.ZodType<Record<string, unknown>>;
  /** Human confirmation text shown in the card, from validated params. */
  describe: (p: Record<string, unknown>) => string;
  /** Run it. Re-validates + audits happen inside the wrapped server action. */
  execute: (p: Record<string, unknown>) => Promise<HepiActionResult>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function resolveCity(sb: Sb, input: string): Promise<{ id: string; name: string; slug: string } | null> {
  const v = input.trim();
  const bySlug = await sb.from('cities').select('id, name, slug').eq('slug', v.toLowerCase()).maybeSingle();
  if (bySlug.data) return bySlug.data;
  const byName = await sb.from('cities').select('id, name, slug').ilike('name', v).limit(1);
  return (byName.data ?? [])[0] ?? null;
}

async function resolveTenant(sb: Sb, input: string): Promise<{ id: string; name: string; slug: string } | null> {
  const v = input.trim();
  const bySlug = await sb.from('tenants').select('id, name, slug').eq('slug', v.toLowerCase()).maybeSingle();
  if (bySlug.data) return bySlug.data;
  const byName = await sb.from('tenants').select('id, name, slug').ilike('name', v).limit(1);
  return (byName.data ?? [])[0] ?? null;
}

const citySchema = z.object({ city: z.string().trim().min(1).max(120) });
const tenantStatusSchema = z.object({
  tenant: z.string().trim().min(1).max(160),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

const ACTIONS: HepiActionDef[] = [
  {
    id: 'activate_city',
    label: 'Activează oraș',
    risk: 'low',
    description:
      'Aduce un oraș LIVE pe platformă (vizibil public + se pot asigna vendori). Dă slug-ul sau numele orașului. Reversibil.',
    inputSchema: {
      type: 'object',
      properties: { city: { type: 'string', description: 'Slug sau nume oraș, ex. "cluj-napoca" sau "Cluj-Napoca"' } },
      required: ['city'],
    },
    schema: citySchema,
    describe: (p) => `Activează orașul „${String(p.city)}" — devine vizibil public și poți asigna vendori în el.`,
    execute: async (p) => {
      const sb = createAdminClient();
      const city = await resolveCity(sb, String(p.city));
      if (!city) return { ok: false, message: `Orașul „${String(p.city)}" nu există în catalog.` };
      const r = await setCityActive({ cityId: city.id, active: true });
      return r.ok ? { ok: true, message: `Am activat orașul ${city.name}.` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'deactivate_city',
    label: 'Dezactivează oraș',
    risk: 'low',
    description: 'Scoate un oraș de pe platformă (nu mai e vizibil public, nu se mai pot asigna vendori). Reversibil.',
    inputSchema: {
      type: 'object',
      properties: { city: { type: 'string', description: 'Slug sau nume oraș' } },
      required: ['city'],
    },
    schema: citySchema,
    describe: (p) => `Dezactivează orașul „${String(p.city)}" — nu mai e vizibil public.`,
    execute: async (p) => {
      const sb = createAdminClient();
      const city = await resolveCity(sb, String(p.city));
      if (!city) return { ok: false, message: `Orașul „${String(p.city)}" nu există în catalog.` };
      const r = await setCityActive({ cityId: city.id, active: false });
      return r.ok ? { ok: true, message: `Am dezactivat orașul ${city.name}.` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'activate_county_capitals',
    label: 'Activează capitalele de județ',
    risk: 'low',
    description: 'Activează toate cele 41 de capitale de județ (40 reședințe + București) ca bază națională. Reversibil.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    schema: z.object({}),
    describe: () => 'Activează toate cele 41 de capitale de județ (reședințe + București).',
    execute: async () => {
      const r = await activateCountyCapitals();
      return r.ok
        ? { ok: true, message: `Am activat capitalele de județ (${r.activated ?? 0} orașe active).` }
        : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'set_tenant_status',
    label: 'Suspendă / reactivează vendor',
    risk: 'high',
    description:
      'Suspendă (storefront inaccesibil, comenzi noi blocate) sau reactivează un vendor. Dă slug-ul/numele vendorului și status ACTIVE sau SUSPENDED.',
    inputSchema: {
      type: 'object',
      properties: {
        tenant: { type: 'string', description: 'Slug sau nume vendor' },
        status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'], description: 'ACTIVE = reactivează, SUSPENDED = suspendă' },
      },
      required: ['tenant', 'status'],
    },
    schema: tenantStatusSchema,
    describe: (p) =>
      p.status === 'SUSPENDED'
        ? `Suspendă vendorul „${String(p.tenant)}" — storefront-ul devine inaccesibil și comenzile noi se blochează.`
        : `Reactivează vendorul „${String(p.tenant)}" — storefront-ul redevine accesibil.`,
    execute: async (p) => {
      const sb = createAdminClient();
      const t = await resolveTenant(sb, String(p.tenant));
      if (!t) return { ok: false, message: `Vendorul „${String(p.tenant)}" nu a fost găsit.` };
      const r = await setTenantStatus({ tenantId: t.id, next: p.status as 'ACTIVE' | 'SUSPENDED' });
      if (!r.ok) return { ok: false, message: `Eroare: ${r.error}` };
      return { ok: true, message: p.status === 'SUSPENDED' ? `Am suspendat ${t.name}.` : `Am reactivat ${t.name}.` };
    },
  },
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function getAction(id: string): HepiActionDef | undefined {
  return BY_ID.get(id);
}

export function listActions(): HepiActionDef[] {
  return ACTIONS;
}

/** Anthropic tool specs for every write action (name = action id). */
export function writeToolSpecs(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return ACTIONS.map((a) => ({ name: a.id, description: a.description, input_schema: a.inputSchema }));
}

export const WRITE_TOOL_IDS = new Set(ACTIONS.map((a) => a.id));

/**
 * Validate params for an action; returns the parsed params + a human confirm
 * string, or an error. Used by both the propose path (hepi route) and the
 * execute path (/execute), so the two agree on exactly what is allowed.
 */
export function validateAction(
  id: string,
  rawParams: unknown,
): { ok: true; action: HepiActionDef; params: Record<string, unknown>; describe: string } | { ok: false; error: string } {
  const action = BY_ID.get(id);
  if (!action) return { ok: false, error: `Acțiune necunoscută: ${id}` };
  const parsed = action.schema.safeParse(rawParams ?? {});
  if (!parsed.success) return { ok: false, error: 'Parametri invalizi pentru acțiune.' };
  const params = parsed.data as Record<string, unknown>;
  return { ok: true, action, params, describe: action.describe(params) };
}
