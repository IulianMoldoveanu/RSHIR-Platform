'use server';

// B2B Marketplace — server actions for vendor-side flows.
//
// Strategy Master Plan Section 5 (B2B Marketplace), Stream 5/9 (UI vendor side).
// Each action forwards the caller's Supabase access token to the matching edge
// function (marketplace-listing-create / marketplace-offer-submit /
// marketplace-match-accept) so the edge fn's own tenant_members / fleet_owner
// gates run with the real user JWT — never the service_role token.
//
// Feature flag: HIR_FEATURE_MARKETPLACE_ENABLED still gates the edge functions
// (503 when off). The UI pages additionally call notFound() so the surface
// disappears entirely when the flag is off.
//
// Anti-regression (CLAUDE.md §5): no new `as any` here. Schema drift on the
// 3 marketplace tables is funneled through the typed admin client and
// untyped helpers in src/lib/supabase/admin.ts.

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

type Vertical = 'restaurant' | 'pharmacy' | 'retail' | 'other';
type Temperature = 'ambient' | 'chilled' | 'frozen';

const VALID_VERTICALS: ReadonlyArray<Vertical> = ['restaurant', 'pharmacy', 'retail', 'other'];
const VALID_TEMPERATURES: ReadonlyArray<Temperature> = ['ambient', 'chilled', 'frozen'];

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

type AuthedSession = {
  userId: string;
  accessToken: string;
};

async function requireAuthedSession(): Promise<
  { ok: true; session: AuthedSession } | { ok: false; error: string }
> {
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id || !session.access_token) {
    return { ok: false, error: 'Sesiune expirată. Te rugăm să te autentifici din nou.' };
  }
  return {
    ok: true,
    session: { userId: session.user.id, accessToken: session.access_token },
  };
}

function edgeFunctionUrl(name: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/functions/v1/${name}`;
}

type EdgeResponse =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

async function callEdgeFunction(
  name: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<EdgeResponse> {
  const url = edgeFunctionUrl(name);
  if (!url) {
    return { ok: false, status: 500, error: 'NEXT_PUBLIC_SUPABASE_URL nu este configurat.' };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: `Edge function unreachable: ${e instanceof Error ? e.message : 'network_error'}`,
    };
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // Fall through: parsed stays null; error message derived below.
  }

  if (!res.ok) {
    const errCode =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error ?? 'unknown_error')
        : `http_${res.status}`;
    return { ok: false, status: res.status, error: errCode };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, status: res.status, error: 'invalid_edge_response' };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

// Map an edge-function error code to a Romanian, vendor-facing message. Falls
// back to a generic phrasing so the form never leaks raw error codes.
function describeEdgeError(code: string): string {
  switch (code) {
    case 'marketplace_feature_not_enabled':
      return 'Marketplace nu este activ momentan.';
    case 'missing_bearer':
    case 'invalid_token':
      return 'Sesiunea a expirat. Reautentifică-te și încearcă din nou.';
    case 'not_tenant_member':
      return 'Nu ai permisiuni pentru acest restaurant.';
    case 'not_fleet_owner':
      return 'Nu ai permisiuni pentru această flotă.';
    case 'listing_not_open':
      return 'Cererea nu mai este deschisă (deja matched sau anulată).';
    case 'listing_not_found':
      return 'Cererea nu a fost găsită.';
    case 'offer_not_found':
      return 'Oferta nu a fost găsită.';
    case 'offer_not_pending':
    case 'offer_already_acted':
      return 'Oferta a fost deja preluată sau retrasă.';
    case 'offer_expired':
      return 'Oferta a expirat.';
    case 'listing_already_matched':
      return 'O altă ofertă a fost deja acceptată pe această cerere.';
    case 'delivery_window_end_must_be_after_start':
      return 'Intervalul de livrare trebuie să fie valid (sfârșit după început).';
    case 'package_description_required':
    case 'package_description_empty':
      return 'Descrierea pachetului este obligatorie.';
    case 'package_weight_grams_invalid':
      return 'Greutatea pachetului nu este validă (max 50 kg).';
    case 'package_temperature_invalid':
      return 'Temperatura selectată nu este validă.';
    case 'pickup_address_invalid':
    case 'dropoff_address_invalid':
    case 'pickup_address_empty':
    case 'address_empty':
      return 'Adresele de ridicare și livrare sunt obligatorii.';
    case 'customer_phone_must_be_redacted':
      return 'Numărul de telefon trebuie să fie redactat (ex. +407*****89).';
    default:
      if (code.startsWith('dropoff_address_pii_forbidden')) {
        return 'Adresa de livrare nu poate conține date personale ale clientului (nume, telefon, email).';
      }
      if (code.startsWith('pickup_address_key_not_allowed') || code.startsWith('address_key_not_allowed')) {
        return 'Adresa conține câmpuri neacceptate.';
      }
      return `Cererea a eșuat (cod: ${code}).`;
  }
}

// ────────────────────────────────────────────────────────────
// Input parsing — FormData → typed payloads
// ────────────────────────────────────────────────────────────

function trim(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseOptionalNumber(v: FormDataEntryValue | null): number | null {
  const s = trim(v);
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseIsoFromDateTimeLocal(v: FormDataEntryValue | null): string | null {
  const raw = trim(v);
  if (raw === '') return null;
  // <input type="datetime-local"> emits e.g. "2026-06-16T12:30" — append seconds
  // so Date.parse treats it as a local-wall-clock timestamp.
  const ms = Date.parse(raw.length === 16 ? `${raw}:00` : raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function buildAddressPayload(input: {
  street: string;
  number: string;
  city: string;
  notes: string;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.street) out.street = input.street;
  if (input.number) out.number = input.number;
  if (input.city) out.city = input.city;
  if (input.notes) out.notes = input.notes;
  return out;
}

// ────────────────────────────────────────────────────────────
// createListingAction — vendor publishes a new B2B listing.
// ────────────────────────────────────────────────────────────

export type CreateListingResult = ActionResult<{ listingId: string }>;

export async function createListingAction(formData: FormData): Promise<CreateListingResult> {
  const auth = await requireAuthedSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const vendorTenantId = trim(formData.get('vendor_tenant_id'));
  if (vendorTenantId === '') {
    return { ok: false, error: 'Selectează restaurantul pentru care publici cererea.' };
  }

  const verticalRaw = trim(formData.get('vertical')) || 'restaurant';
  if (!VALID_VERTICALS.includes(verticalRaw as Vertical)) {
    return { ok: false, error: 'Vertical invalid.' };
  }
  const vertical = verticalRaw as Vertical;

  const cityId = trim(formData.get('city_id')) || null;

  const deliveryWindowStart = parseIsoFromDateTimeLocal(formData.get('delivery_window_start'));
  const deliveryWindowEnd = parseIsoFromDateTimeLocal(formData.get('delivery_window_end'));
  if (!deliveryWindowStart || !deliveryWindowEnd) {
    return { ok: false, error: 'Intervalul de livrare este obligatoriu.' };
  }
  if (Date.parse(deliveryWindowEnd) <= Date.parse(deliveryWindowStart)) {
    return { ok: false, error: 'Sfârșitul intervalului trebuie să fie după început.' };
  }

  const pickupAddress = buildAddressPayload({
    street: trim(formData.get('pickup_street')),
    number: trim(formData.get('pickup_number')),
    city: trim(formData.get('pickup_city')),
    notes: trim(formData.get('pickup_notes')),
  });
  if (Object.keys(pickupAddress).length === 0) {
    return { ok: false, error: 'Adresa de ridicare este obligatorie.' };
  }

  const dropoffAddress = buildAddressPayload({
    street: trim(formData.get('dropoff_street')),
    number: trim(formData.get('dropoff_number')),
    city: trim(formData.get('dropoff_city')),
    notes: trim(formData.get('dropoff_notes')),
  });
  if (Object.keys(dropoffAddress).length === 0) {
    return { ok: false, error: 'Adresa de livrare este obligatorie.' };
  }

  const packageDescription = trim(formData.get('package_description'));
  if (packageDescription === '') {
    return { ok: false, error: 'Descrierea pachetului este obligatorie.' };
  }

  const weightGramsRaw = parseOptionalNumber(formData.get('package_weight_grams'));
  let packageWeightGrams: number | null = null;
  if (weightGramsRaw !== null) {
    if (!Number.isInteger(weightGramsRaw) || weightGramsRaw < 0 || weightGramsRaw > 50_000) {
      return { ok: false, error: 'Greutatea pachetului trebuie să fie între 0 și 50000 g.' };
    }
    packageWeightGrams = weightGramsRaw;
  }

  const temperatureRaw = trim(formData.get('package_temperature'));
  let packageTemperature: Temperature | null = null;
  if (temperatureRaw !== '') {
    if (!VALID_TEMPERATURES.includes(temperatureRaw as Temperature)) {
      return { ok: false, error: 'Temperatura selectată nu este validă.' };
    }
    packageTemperature = temperatureRaw as Temperature;
  }

  const customerPhoneRedacted = trim(formData.get('customer_phone_redacted')) || null;

  const payload: Record<string, unknown> = {
    vendor_tenant_id: vendorTenantId,
    vertical,
    city_id: cityId,
    delivery_window_start: deliveryWindowStart,
    delivery_window_end: deliveryWindowEnd,
    pickup_address: pickupAddress,
    dropoff_address: dropoffAddress,
    package_description: packageDescription,
    package_weight_grams: packageWeightGrams,
    package_temperature: packageTemperature,
    customer_phone_redacted: customerPhoneRedacted,
    publish: true,
  };

  const res = await callEdgeFunction(
    'marketplace-listing-create',
    auth.session.accessToken,
    payload,
  );
  if (!res.ok) return { ok: false, error: describeEdgeError(res.error) };

  const listingId = typeof res.body.listing_id === 'string' ? res.body.listing_id : null;
  if (!listingId) return { ok: false, error: 'Răspuns invalid de la server.' };

  revalidatePath('/marketplace/listings');
  revalidatePath('/marketplace/dashboard');
  return { ok: true, data: { listingId } };
}

// ────────────────────────────────────────────────────────────
// cancelListingAction — vendor cancels a DRAFT or OPEN listing.
// Direct UPDATE via admin client gated by membership check (RLS would also
// catch it; belt+suspenders matches the lib/tenant.ts pattern).
// ────────────────────────────────────────────────────────────

export async function cancelListingAction(listingId: string): Promise<ActionResult> {
  if (typeof listingId !== 'string' || listingId === '') {
    return { ok: false, error: 'ID cerere invalid.' };
  }

  const auth = await requireAuthedSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  // Untyped admin client: marketplace_* tables not yet in generated DB types
  // (schema drift); centralized escape per CLAUDE.md §5.3 lives in admin.ts.
  const admin = createAdminClientUntyped();

  // Load listing + verify caller is tenant member.
  const { data: listingRow, error: listingErr } = await admin
    .from('marketplace_listings')
    .select('id, vendor_tenant_id, status')
    .eq('id', listingId)
    .maybeSingle();
  if (listingErr) return { ok: false, error: `Eroare la încărcarea cererii: ${listingErr.message}` };
  if (!listingRow) return { ok: false, error: 'Cererea nu a fost găsită.' };

  const vendorTenantId: string = String(
    (listingRow as { vendor_tenant_id: unknown }).vendor_tenant_id ?? '',
  );
  const currentStatus: string = String((listingRow as { status: unknown }).status ?? '');

  if (currentStatus !== 'DRAFT' && currentStatus !== 'OPEN') {
    return {
      ok: false,
      error: 'Cererea nu mai poate fi anulată (deja matched sau finalizată).',
    };
  }

  const { data: member, error: memberErr } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', auth.session.userId)
    .eq('tenant_id', vendorTenantId)
    .maybeSingle();
  if (memberErr) return { ok: false, error: `Eroare la verificarea permisiunilor: ${memberErr.message}` };
  if (!member) return { ok: false, error: 'Nu ai permisiuni pentru acest restaurant.' };

  const { error: updateErr } = await admin
    .from('marketplace_listings')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', listingId)
    .in('status', ['DRAFT', 'OPEN']);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath('/marketplace/listings');
  revalidatePath(`/marketplace/listings/${listingId}`);
  revalidatePath('/marketplace/dashboard');
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// acceptOfferAction — vendor accepts a PENDING offer on their listing.
// Calls marketplace-match-accept edge fn so the atomic CAS + compensation
// logic stays in one place.
// ────────────────────────────────────────────────────────────

export type AcceptOfferResult = ActionResult<{
  matchId: string;
  finalPriceCents: number;
  hirFeeCents: number;
}>;

export async function acceptOfferAction(input: {
  offerId: string;
  listingId: string;
  hirFeeCents?: number;
}): Promise<AcceptOfferResult> {
  const auth = await requireAuthedSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (typeof input.offerId !== 'string' || input.offerId === '') {
    return { ok: false, error: 'ID ofertă invalid.' };
  }

  const payload: Record<string, unknown> = { offer_id: input.offerId };
  if (typeof input.hirFeeCents === 'number' && Number.isFinite(input.hirFeeCents)) {
    payload.hir_fee_cents = Math.round(input.hirFeeCents);
  }

  const res = await callEdgeFunction(
    'marketplace-match-accept',
    auth.session.accessToken,
    payload,
  );
  if (!res.ok) return { ok: false, error: describeEdgeError(res.error) };

  const matchId = typeof res.body.match_id === 'string' ? res.body.match_id : null;
  const finalPriceCents =
    typeof res.body.final_price_cents === 'number' ? res.body.final_price_cents : null;
  const hirFeeCents =
    typeof res.body.hir_fee_cents === 'number' ? res.body.hir_fee_cents : null;
  if (!matchId || finalPriceCents === null || hirFeeCents === null) {
    return { ok: false, error: 'Răspuns invalid de la server.' };
  }

  revalidatePath('/marketplace/listings');
  revalidatePath(`/marketplace/listings/${input.listingId}`);
  revalidatePath('/marketplace/dashboard');
  return {
    ok: true,
    data: { matchId, finalPriceCents, hirFeeCents },
  };
}
