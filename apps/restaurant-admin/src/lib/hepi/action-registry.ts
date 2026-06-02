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
import { setTenantStatus, setTenantCity } from '@/app/dashboard/admin/tenants/actions';
import { verifyFleetKyf } from '@/app/dashboard/admin/verifications/actions';
import { assignFleet, markStrike } from '@/app/dashboard/admin/fleet-allocation/actions';
import { createPartner } from '@/app/dashboard/admin/partners/actions';
import { generatePreviousWeek } from '@/app/dashboard/admin/connect-billing/actions';

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

async function resolveFleet(sb: Sb, input: string): Promise<{ id: string; name: string } | null> {
  const v = input.trim();
  if (/^[0-9a-f-]{36}$/i.test(v)) {
    const byId = await sb.from('courier_fleets').select('id, name').eq('id', v).maybeSingle();
    if (byId.data) return byId.data;
  }
  const byName = await sb.from('courier_fleets').select('id, name').ilike('name', v).limit(1);
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
  {
    id: 'set_tenant_city',
    label: 'Setează orașul vendorului',
    risk: 'low',
    description: 'Asignează orașul canonic al unui vendor. Dă numele/slug-ul vendorului și orașul.',
    inputSchema: {
      type: 'object',
      properties: {
        tenant: { type: 'string', description: 'Nume sau slug vendor' },
        city: { type: 'string', description: 'Nume sau slug oraș' },
      },
      required: ['tenant', 'city'],
    },
    schema: z.object({ tenant: z.string().trim().min(1).max(160), city: z.string().trim().min(1).max(120) }),
    describe: (p) => `Setează orașul „${String(p.city)}" pentru vendorul „${String(p.tenant)}".`,
    execute: async (p) => {
      const sb = createAdminClient();
      const [t, c] = await Promise.all([resolveTenant(sb, String(p.tenant)), resolveCity(sb, String(p.city))]);
      if (!t) return { ok: false, message: `Vendorul „${String(p.tenant)}" nu a fost găsit.` };
      if (!c) return { ok: false, message: `Orașul „${String(p.city)}" nu există în catalog.` };
      const r = await setTenantCity({ tenantId: t.id, citySlug: c.slug });
      return r.ok ? { ok: true, message: `Am setat orașul ${c.name} pentru ${t.name}.` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'verify_fleet_kyf',
    label: 'Verifică flotă (KYF)',
    risk: 'high',
    description:
      'Aprobă (VERIFIED) sau respinge (REJECTED) verificarea de legitimitate a unei flote (KYF). Dă numele flotei + decizia; la respingere e obligatoriu un motiv.',
    inputSchema: {
      type: 'object',
      properties: {
        fleet: { type: 'string', description: 'Nume flotă' },
        decision: { type: 'string', enum: ['VERIFIED', 'REJECTED'] },
        reason: { type: 'string', description: 'Motiv (obligatoriu la REJECTED)' },
      },
      required: ['fleet', 'decision'],
    },
    schema: z.object({
      fleet: z.string().trim().min(1).max(160),
      decision: z.enum(['VERIFIED', 'REJECTED']),
      reason: z.string().trim().max(500).optional(),
    }),
    describe: (p) =>
      p.decision === 'VERIFIED'
        ? `Aprobă KYF pentru flota „${String(p.fleet)}".`
        : `Respinge KYF pentru flota „${String(p.fleet)}" (motiv: ${String(p.reason ?? '—')}).`,
    execute: async (p) => {
      const sb = createAdminClient();
      const f = await resolveFleet(sb, String(p.fleet));
      if (!f) return { ok: false, message: `Flota „${String(p.fleet)}" nu a fost găsită.` };
      const r = await verifyFleetKyf(f.id, p.decision as 'VERIFIED' | 'REJECTED', p.reason as string | undefined);
      if (!r.ok) return { ok: false, message: `Eroare: ${r.error}` };
      return { ok: true, message: p.decision === 'VERIFIED' ? `Am aprobat KYF pentru ${f.name}.` : `Am respins KYF pentru ${f.name}.` };
    },
  },
  {
    id: 'assign_fleet',
    label: 'Asignează flotă la vendor',
    risk: 'low',
    description:
      'Asignează o flotă de curieri unui vendor (restaurant), cu rol primary sau secondary. Dă numele flotei, vendorul și rolul.',
    inputSchema: {
      type: 'object',
      properties: {
        fleet: { type: 'string', description: 'Nume flotă' },
        tenant: { type: 'string', description: 'Nume/slug vendor' },
        role: { type: 'string', enum: ['primary', 'secondary'] },
      },
      required: ['fleet', 'tenant', 'role'],
    },
    schema: z.object({
      fleet: z.string().trim().min(1).max(160),
      tenant: z.string().trim().min(1).max(160),
      role: z.enum(['primary', 'secondary']),
    }),
    describe: (p) => `Asignează flota „${String(p.fleet)}" la vendorul „${String(p.tenant)}" ca ${String(p.role)}.`,
    execute: async (p) => {
      const sb = createAdminClient();
      const [f, t] = await Promise.all([resolveFleet(sb, String(p.fleet)), resolveTenant(sb, String(p.tenant))]);
      if (!f) return { ok: false, message: `Flota „${String(p.fleet)}" nu a fost găsită.` };
      if (!t) return { ok: false, message: `Vendorul „${String(p.tenant)}" nu a fost găsit.` };
      const r = await assignFleet({ fleet_id: f.id, restaurant_tenant_id: t.id, role: p.role as 'primary' | 'secondary' });
      return r.ok ? { ok: true, message: `Am asignat ${f.name} la ${t.name} (${String(p.role)}).` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'mark_fleet_strike',
    label: 'Strike flotă',
    risk: 'high',
    description:
      'Înregistrează un strike (incident de fiabilitate) pentru o pereche flotă–vendor. La 5 strike-uri în 30 de zile, asignările active se pun automat pe pauză. Dă flota, vendorul și motivul.',
    inputSchema: {
      type: 'object',
      properties: {
        fleet: { type: 'string', description: 'Nume flotă' },
        tenant: { type: 'string', description: 'Nume/slug vendor' },
        reason: { type: 'string', description: 'Motivul strike-ului' },
      },
      required: ['fleet', 'tenant', 'reason'],
    },
    schema: z.object({
      fleet: z.string().trim().min(1).max(160),
      tenant: z.string().trim().min(1).max(160),
      reason: z.string().trim().min(1).max(500),
    }),
    describe: (p) => `Strike pentru flota „${String(p.fleet)}" pe vendorul „${String(p.tenant)}" (motiv: ${String(p.reason)}).`,
    execute: async (p) => {
      const sb = createAdminClient();
      const [f, t] = await Promise.all([resolveFleet(sb, String(p.fleet)), resolveTenant(sb, String(p.tenant))]);
      if (!f) return { ok: false, message: `Flota „${String(p.fleet)}" nu a fost găsită.` };
      if (!t) return { ok: false, message: `Vendorul „${String(p.tenant)}" nu a fost găsit.` };
      const r = await markStrike({ fleet_id: f.id, restaurant_tenant_id: t.id, reason: String(p.reason) });
      if (!r.ok) return { ok: false, message: `Eroare: ${r.error}` };
      return { ok: true, message: `Strike înregistrat (${r.strike_count}/5${r.auto_paused ? ' — asignări puse pe pauză' : ''}).` };
    },
  },
  {
    id: 'create_partner',
    label: 'Creează partener (reseller)',
    risk: 'high',
    description: 'Creează un partener nou (reseller) cu nume, email, telefon opțional și comision implicit (%).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        commissionPct: { type: 'number', description: 'Comision implicit, procent 0-100' },
      },
      required: ['name', 'email', 'commissionPct'],
    },
    schema: z.object({
      name: z.string().trim().min(2).max(160),
      email: z.string().trim().email().max(200),
      phone: z.string().trim().max(40).optional(),
      commissionPct: z.number().min(0).max(100),
    }),
    describe: (p) => `Creează partenerul „${String(p.name)}" (${String(p.email)}), comision ${String(p.commissionPct)}%.`,
    execute: async (p) => {
      const r = await createPartner({
        name: String(p.name),
        email: String(p.email),
        phone: p.phone ? String(p.phone) : undefined,
        default_commission_pct: Number(p.commissionPct),
      });
      return r.ok ? { ok: true, message: `Am creat partenerul ${String(p.name)}.` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'generate_connect_invoices',
    label: 'Generează facturi Connect (săpt. trecută)',
    risk: 'low',
    description: 'Generează facturile săptămânale HIR Connect pentru săptămâna trecută (idempotent).',
    inputSchema: { type: 'object', properties: {}, required: [] },
    schema: z.object({}),
    describe: () => 'Generează facturile Connect pentru săptămâna trecută.',
    execute: async () => {
      const r = await generatePreviousWeek();
      if (!r.ok) return { ok: false, message: `Eroare: ${r.error}` };
      return { ok: true, message: `Facturi Connect generate${typeof r.created === 'number' ? ` (${r.created})` : ''}.` };
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
