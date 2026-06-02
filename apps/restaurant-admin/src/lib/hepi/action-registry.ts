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
import { verifyFleetKyf, verifyCourierKyc } from '@/app/dashboard/admin/verifications/actions';
import { assignFleet, markStrike, promoteToPrimary, terminateAssignment } from '@/app/dashboard/admin/fleet-allocation/actions';
import { createPartner } from '@/app/dashboard/admin/partners/actions';
import { generatePreviousWeek } from '@/app/dashboard/admin/connect-billing/actions';
import { createIncident, updateIncidentStatus } from '@/app/dashboard/admin/incidents/actions';
import { addFleetManagerMembership } from '@/app/dashboard/admin/fleet-managers/actions';
import { createTenantWithOwner } from '@/app/dashboard/admin/onboard/actions';
import { createSiblingLocationAction } from '@/app/dashboard/admin/onboard/sibling/actions';

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

async function resolveCourier(sb: Sb, input: string): Promise<{ user_id: string; full_name: string } | null> {
  const v = input.trim();
  if (/^[0-9a-f-]{36}$/i.test(v)) {
    const byId = await sb.from('courier_profiles').select('user_id, full_name').eq('user_id', v).maybeSingle();
    if (byId.data) return byId.data;
  }
  const byName = await sb.from('courier_profiles').select('user_id, full_name').ilike('full_name', v).limit(1);
  return (byName.data ?? [])[0] ?? null;
}

async function resolveIncident(sb: Sb, title: string): Promise<{ id: string; title: string } | null> {
  const v = title.trim();
  const r = await sb.from('public_incidents').select('id, title').ilike('title', `%${v}%`).limit(1);
  return (r.data ?? [])[0] ?? null;
}

async function resolveActiveAssignment(
  sb: Sb,
  fleetId: string,
  tenantId: string,
  role?: string,
): Promise<{ id: string; role: string } | null> {
  let q = sb
    .from('fleet_restaurant_assignments')
    .select('id, role')
    .eq('fleet_id', fleetId)
    .eq('restaurant_tenant_id', tenantId)
    .eq('status', 'active');
  if (role) q = q.eq('role', role);
  const r = await q.limit(1);
  return (r.data ?? [])[0] ?? null;
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
  {
    id: 'verify_courier_kyc',
    label: 'Verifică curier (KYC)',
    risk: 'high',
    description:
      'Aprobă (VERIFIED) sau respinge (REJECTED) verificarea de identitate (KYC) a unui curier. Dă numele curierului + decizia; la respingere e obligatoriu un motiv.',
    inputSchema: {
      type: 'object',
      properties: {
        courier: { type: 'string', description: 'Numele curierului' },
        decision: { type: 'string', enum: ['VERIFIED', 'REJECTED'] },
        reason: { type: 'string', description: 'Motiv (obligatoriu la REJECTED)' },
      },
      required: ['courier', 'decision'],
    },
    schema: z.object({
      courier: z.string().trim().min(1).max(160),
      decision: z.enum(['VERIFIED', 'REJECTED']),
      reason: z.string().trim().max(500).optional(),
    }),
    describe: (p) =>
      p.decision === 'VERIFIED'
        ? `Aprobă KYC pentru curierul „${String(p.courier)}".`
        : `Respinge KYC pentru curierul „${String(p.courier)}" (motiv: ${String(p.reason ?? '—')}).`,
    execute: async (p) => {
      const sb = createAdminClient();
      const c = await resolveCourier(sb, String(p.courier));
      if (!c) return { ok: false, message: `Curierul „${String(p.courier)}" nu a fost găsit.` };
      const r = await verifyCourierKyc(c.user_id, p.decision as 'VERIFIED' | 'REJECTED', p.reason as string | undefined);
      if (!r.ok) return { ok: false, message: `Eroare: ${r.error}` };
      return { ok: true, message: p.decision === 'VERIFIED' ? `Am aprobat KYC pentru ${c.full_name}.` : `Am respins KYC pentru ${c.full_name}.` };
    },
  },
  {
    id: 'create_incident',
    label: 'Creează incident',
    risk: 'high',
    description:
      'Creează un incident public pe pagina de status. Dă titlul, statusul, severitatea, serviciile afectate și o descriere opțională.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        status: { type: 'string', enum: ['investigating', 'identified', 'monitoring', 'resolved'] },
        severity: { type: 'string', enum: ['minor', 'major', 'critical'] },
        affectedServices: { type: 'array', items: { type: 'string' }, description: 'Servicii afectate' },
        description: { type: 'string' },
      },
      required: ['title', 'status', 'severity', 'affectedServices'],
    },
    schema: z.object({
      title: z.string().trim().min(3).max(200),
      status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
      severity: z.enum(['minor', 'major', 'critical']),
      affectedServices: z.array(z.string().trim().min(1)).min(1).max(20),
      description: z.string().trim().max(2000).optional(),
    }),
    describe: (p) => `Creează incident „${String(p.title)}" (${String(p.severity)} / ${String(p.status)}).`,
    execute: async (p) => {
      const r = await createIncident({
        title: String(p.title),
        status: p.status as 'investigating' | 'identified' | 'monitoring' | 'resolved',
        severity: p.severity as 'minor' | 'major' | 'critical',
        affectedServices: p.affectedServices as string[],
        description: p.description ? String(p.description) : undefined,
      });
      return r.ok ? { ok: true, message: `Am creat incidentul „${String(p.title)}".` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'set_incident_status',
    label: 'Schimbă statusul unui incident',
    risk: 'high',
    description:
      'Schimbă statusul unui incident existent (investigating/identified/monitoring/resolved). Identifică incidentul după titlu; opțional adaugă o notă.',
    inputSchema: {
      type: 'object',
      properties: {
        incident: { type: 'string', description: 'Titlul incidentului (potrivire parțială)' },
        status: { type: 'string', enum: ['investigating', 'identified', 'monitoring', 'resolved'] },
        note: { type: 'string' },
      },
      required: ['incident', 'status'],
    },
    schema: z.object({
      incident: z.string().trim().min(2).max(200),
      status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
      note: z.string().trim().max(2000).optional(),
    }),
    describe: (p) => `Setează incidentul „${String(p.incident)}" la statusul „${String(p.status)}".`,
    execute: async (p) => {
      const sb = createAdminClient();
      const inc = await resolveIncident(sb, String(p.incident));
      if (!inc) return { ok: false, message: `Incidentul „${String(p.incident)}" nu a fost găsit.` };
      const r = await updateIncidentStatus({
        incidentId: inc.id,
        status: p.status as 'investigating' | 'identified' | 'monitoring' | 'resolved',
        note: p.note ? String(p.note) : undefined,
      });
      return r.ok ? { ok: true, message: `Incidentul „${inc.title}" → ${String(p.status)}.` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'promote_fleet_primary',
    label: 'Promovează flota la primary',
    risk: 'low',
    description:
      'Promovează asignarea unei flote pe un vendor la rol primary (termină primary-ul activ existent). Dă flota și vendorul.',
    inputSchema: {
      type: 'object',
      properties: {
        fleet: { type: 'string', description: 'Nume flotă' },
        tenant: { type: 'string', description: 'Nume/slug vendor' },
      },
      required: ['fleet', 'tenant'],
    },
    schema: z.object({ fleet: z.string().trim().min(1).max(160), tenant: z.string().trim().min(1).max(160) }),
    describe: (p) => `Promovează flota „${String(p.fleet)}" la primary pe vendorul „${String(p.tenant)}".`,
    execute: async (p) => {
      const sb = createAdminClient();
      const [f, t] = await Promise.all([resolveFleet(sb, String(p.fleet)), resolveTenant(sb, String(p.tenant))]);
      if (!f) return { ok: false, message: `Flota „${String(p.fleet)}" nu a fost găsită.` };
      if (!t) return { ok: false, message: `Vendorul „${String(p.tenant)}" nu a fost găsit.` };
      const a = await resolveActiveAssignment(sb, f.id, t.id);
      if (!a) return { ok: false, message: `Nu există o asignare activă ${f.name}–${t.name}.` };
      const r = await promoteToPrimary({ assignment_id: a.id });
      return r.ok ? { ok: true, message: `Am promovat ${f.name} la primary pe ${t.name}.` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'terminate_fleet_assignment',
    label: 'Termină asignarea unei flote',
    risk: 'high',
    description: 'Termină asignarea activă a unei flote pe un vendor. Dă flota și vendorul (opțional rolul primary/secondary).',
    inputSchema: {
      type: 'object',
      properties: {
        fleet: { type: 'string', description: 'Nume flotă' },
        tenant: { type: 'string', description: 'Nume/slug vendor' },
        role: { type: 'string', enum: ['primary', 'secondary'] },
      },
      required: ['fleet', 'tenant'],
    },
    schema: z.object({
      fleet: z.string().trim().min(1).max(160),
      tenant: z.string().trim().min(1).max(160),
      role: z.enum(['primary', 'secondary']).optional(),
    }),
    describe: (p) =>
      `Termină asignarea flotei „${String(p.fleet)}" pe „${String(p.tenant)}"${p.role ? ` (${String(p.role)})` : ''}.`,
    execute: async (p) => {
      const sb = createAdminClient();
      const [f, t] = await Promise.all([resolveFleet(sb, String(p.fleet)), resolveTenant(sb, String(p.tenant))]);
      if (!f) return { ok: false, message: `Flota „${String(p.fleet)}" nu a fost găsită.` };
      if (!t) return { ok: false, message: `Vendorul „${String(p.tenant)}" nu a fost găsit.` };
      const a = await resolveActiveAssignment(sb, f.id, t.id, p.role ? String(p.role) : undefined);
      if (!a) return { ok: false, message: `Nu există o asignare activă ${f.name}–${t.name}.` };
      const r = await terminateAssignment({ assignment_id: a.id });
      return r.ok ? { ok: true, message: `Am terminat asignarea ${f.name}–${t.name}.` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'grant_fleet_manager',
    label: 'Acordă rol Fleet Manager',
    risk: 'high',
    description: 'Acordă rolul de Fleet Manager unui utilizator (după email) pe un vendor. Dă emailul și vendorul.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Emailul utilizatorului' },
        tenant: { type: 'string', description: 'Nume/slug vendor' },
      },
      required: ['email', 'tenant'],
    },
    schema: z.object({ email: z.string().trim().email().max(200), tenant: z.string().trim().min(1).max(160) }),
    describe: (p) => `Acordă rol Fleet Manager lui ${String(p.email)} pe vendorul „${String(p.tenant)}".`,
    execute: async (p) => {
      const sb = createAdminClient();
      const t = await resolveTenant(sb, String(p.tenant));
      if (!t) return { ok: false, message: `Vendorul „${String(p.tenant)}" nu a fost găsit.` };
      const r = await addFleetManagerMembership({ email: String(p.email), tenant_id: t.id });
      return r.ok ? { ok: true, message: `Am acordat rol Fleet Manager lui ${String(p.email)} pe ${t.name}.` } : { ok: false, message: `Eroare: ${r.error}` };
    },
  },
  {
    id: 'onboard_vendor',
    label: 'Onboard vendor nou',
    risk: 'high',
    description:
      'Creează un vendor (restaurant) nou cu cont owner: email, nume, slug, telefon opțional, oraș opțional (nume/slug), adresă, tagline. Întoarce parola temporară + URL storefront.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Emailul patronului (owner)' },
        restaurantName: { type: 'string' },
        slug: { type: 'string', description: 'slug 3-30, doar a-z0-9 și -' },
        phone: { type: 'string' },
        city: { type: 'string', description: 'Nume/slug oraș (opțional)' },
        address: { type: 'string' },
        tagline: { type: 'string' },
      },
      required: ['email', 'restaurantName', 'slug'],
    },
    schema: z.object({
      email: z.string().trim().email().max(200),
      restaurantName: z.string().trim().min(2).max(100),
      slug: z.string().trim().min(3).max(30),
      phone: z.string().trim().max(30).optional(),
      city: z.string().trim().max(120).optional(),
      address: z.string().trim().max(300).optional(),
      tagline: z.string().trim().max(200).optional(),
    }),
    describe: (p) => `Onboardează vendorul „${String(p.restaurantName)}" (${String(p.email)}, slug ${String(p.slug)}).`,
    execute: async (p) => {
      const sb = createAdminClient();
      let cityId: string | undefined;
      if (p.city) {
        const c = await resolveCity(sb, String(p.city));
        if (!c) return { ok: false, message: `Orașul „${String(p.city)}" nu există în catalog.` };
        cityId = c.id;
      }
      const r = await createTenantWithOwner({
        email: String(p.email),
        restaurantName: String(p.restaurantName),
        slug: String(p.slug),
        phone: p.phone ? String(p.phone) : undefined,
        cityId,
        address: p.address ? String(p.address) : undefined,
        tagline: p.tagline ? String(p.tagline) : undefined,
      });
      if (!r.ok) return { ok: false, message: `Eroare: ${r.error}` };
      return {
        ok: true,
        message: `Am creat vendorul „${String(p.restaurantName)}". Storefront: ${r.storefrontUrl} · parolă temporară: ${r.tempPassword}`,
      };
    },
  },
  {
    id: 'create_sibling_location',
    label: 'Creează locație soră (multi-city)',
    risk: 'high',
    description:
      'Creează o locație soră a unui vendor existent (același brand, alt oraș). Dă brandul rădăcină, numele + slug-ul locației noi, orașul opțional, și dacă să clonezi meniul/branding-ul.',
    inputSchema: {
      type: 'object',
      properties: {
        rootTenant: { type: 'string', description: 'Nume/slug vendor rădăcină' },
        name: { type: 'string' },
        slug: { type: 'string' },
        city: { type: 'string', description: 'Nume/slug oraș (opțional)' },
        cloneMenu: { type: 'boolean' },
        cloneBranding: { type: 'boolean' },
      },
      required: ['rootTenant', 'name', 'slug'],
    },
    schema: z.object({
      rootTenant: z.string().trim().min(1).max(160),
      name: z.string().trim().min(2).max(200),
      slug: z.string().trim().min(2).max(60),
      city: z.string().trim().max(120).optional(),
      cloneMenu: z.boolean().optional(),
      cloneBranding: z.boolean().optional(),
    }),
    describe: (p) => `Creează locația soră „${String(p.name)}" sub brandul „${String(p.rootTenant)}".`,
    execute: async (p) => {
      const sb = createAdminClient();
      const root = await resolveTenant(sb, String(p.rootTenant));
      if (!root) return { ok: false, message: `Brandul „${String(p.rootTenant)}" nu a fost găsit.` };
      let cityId: string | null = null;
      if (p.city) {
        const c = await resolveCity(sb, String(p.city));
        if (!c) return { ok: false, message: `Orașul „${String(p.city)}" nu există în catalog.` };
        cityId = c.id;
      }
      const r = await createSiblingLocationAction({
        rootTenantId: root.id,
        name: String(p.name),
        slug: String(p.slug),
        cityId,
        cloneMenu: p.cloneMenu !== false,
        cloneBranding: p.cloneBranding !== false,
      });
      return r.ok
        ? { ok: true, message: `Am creat locația „${r.newTenantName}" (meniu: ${r.clonedItems} produse).` }
        : { ok: false, message: `Eroare: ${r.error}` };
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
