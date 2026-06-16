'use server';

// B2B Marketplace — fleet-side server actions (Stream 6/9 UI fleet side).
// Strategy Master Plan Section 5. Gated by HIR_FEATURE_MARKETPLACE_ENABLED.
//
// Two actions live here:
//
//   submitOfferAction   — forwards the fleet manager's bid to the
//                         marketplace-offer-submit edge function with the
//                         caller's access token (the edge fn re-verifies
//                         ownership via courier_fleets.owner_user_id).
//   withdrawOfferAction — direct UPDATE on marketplace_offers, scoped by
//                         fleet_id + PENDING status so a manager can only
//                         withdraw their own still-bidable offers. Uses the
//                         service_role client (RLS today is DENY-all on the
//                         marketplace tables — RLS-per-role lands in the
//                         009 migration; until then, server-side scoping
//                         is the enforcement boundary).
//
// Feature flag gate is checked at the top of each action. UI routes
// already gate at render time with notFound(), but a stale tab could still
// post — server actions must reject too.

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFleetManagerContext } from '@/lib/fleet-manager';

export type MarketplaceActionResult =
  | { ok: true; offerId?: string }
  | { ok: false; error: string };

function featureEnabled(): boolean {
  return process.env.HIR_FEATURE_MARKETPLACE_ENABLED === 'true';
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MIN_ETA_MINUTES = 1;
const MAX_ETA_MINUTES = 240;
const MAX_PRICE_CENTS = 1_000_000_00; // 1,000,000 RON sanity ceiling
const MAX_NOTES_CHARS = 1000;

/**
 * Submit (or revise) an offer on an OPEN listing.
 *
 * Form fields:
 *   listing_id          — uuid
 *   offered_price_ron   — decimal RON (converted to cents)
 *   eta_minutes         — int 1..240
 *   expires_at          — ISO timestamp (offer validity)
 *   notes               — optional, <= 1000 chars
 *
 * The edge function re-validates every field and verifies the caller owns
 * the fleet — we forward the caller's JWT and let it do the heavy lifting.
 * Returning the offer_id lets the UI optimistically link to it.
 */
export async function submitOfferAction(
  formData: FormData,
): Promise<MarketplaceActionResult> {
  if (!featureEnabled()) {
    return { ok: false, error: 'Marketplace nu este activ pentru această flotă.' };
  }

  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };
  if (!ctx.isActive) return { ok: false, error: 'Flota este inactivă.' };

  const listingId = (formData.get('listing_id') as string | null)?.trim() ?? '';
  const priceRaw = (formData.get('offered_price_ron') as string | null)?.trim() ?? '';
  const etaRaw = (formData.get('eta_minutes') as string | null)?.trim() ?? '';
  const expiresAtRaw = (formData.get('expires_at') as string | null)?.trim() ?? '';
  const notesRaw = (formData.get('notes') as string | null)?.trim() ?? '';

  if (!UUID_RE.test(listingId)) {
    return { ok: false, error: 'Cererea selectată este invalidă.' };
  }

  // RON is entered with a decimal separator (comma or dot). Normalise both.
  const priceRon = Number(priceRaw.replace(',', '.'));
  if (!Number.isFinite(priceRon) || priceRon < 0) {
    return { ok: false, error: 'Prețul ofertat trebuie să fie un număr ≥ 0.' };
  }
  const offeredPriceCents = Math.round(priceRon * 100);
  if (offeredPriceCents > MAX_PRICE_CENTS) {
    return { ok: false, error: 'Prețul ofertat este prea mare.' };
  }

  const etaMinutes = Number.parseInt(etaRaw, 10);
  if (!Number.isFinite(etaMinutes) || etaMinutes < MIN_ETA_MINUTES || etaMinutes > MAX_ETA_MINUTES) {
    return { ok: false, error: `ETA trebuie între ${MIN_ETA_MINUTES} și ${MAX_ETA_MINUTES} minute.` };
  }

  if (!expiresAtRaw) {
    return { ok: false, error: 'Setează durata de valabilitate a ofertei.' };
  }
  const expiresMs = Date.parse(expiresAtRaw);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    return { ok: false, error: 'Valabilitatea ofertei trebuie să fie în viitor.' };
  }

  let notes: string | null = null;
  if (notesRaw.length > 0) {
    if (notesRaw.length > MAX_NOTES_CHARS) {
      return { ok: false, error: `Notele pot avea maxim ${MAX_NOTES_CHARS} caractere.` };
    }
    notes = notesRaw;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { ok: false, error: 'Configurare Supabase lipsă.' };
  }

  // Forward the caller's JWT to the edge fn — it re-verifies fleet ownership.
  const supabase = await createServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { ok: false, error: 'Sesiunea a expirat. Reconectează-te.' };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/marketplace-offer-submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        listing_id: listingId,
        fleet_id: ctx.fleetId,
        offered_price_cents: offeredPriceCents,
        eta_minutes: etaMinutes,
        expires_at: new Date(expiresMs).toISOString(),
        notes,
      }),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Trimiterea ofertei a eșuat.',
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: 'Răspuns invalid de la marketplace.' };
  }

  const body = (payload ?? {}) as { ok?: boolean; error?: string; offer_id?: string };
  if (!response.ok || body.ok !== true) {
    return {
      ok: false,
      error: body.error ?? `Trimiterea ofertei a eșuat (HTTP ${response.status}).`,
    };
  }

  revalidatePath('/fleet/marketplace');
  revalidatePath('/fleet/marketplace/listings');
  revalidatePath('/fleet/marketplace/offers');
  revalidatePath(`/fleet/marketplace/listings/${listingId}`);

  return { ok: true, offerId: body.offer_id };
}

/**
 * Withdraw a still-PENDING offer the fleet placed earlier.
 *
 * Direct UPDATE via service_role (RLS today is DENY-all on marketplace_offers
 * — RLS-per-role lands in migration 20260616_009). Until that lands we enforce
 * scoping server-side: fleet_id must match the caller's fleet AND status must
 * still be PENDING (terminal statuses can't be undone). `.select().maybeSingle()`
 * surfaces a zero-row update as an explicit error instead of a silent success.
 */
export async function withdrawOfferAction(
  offerId: string,
): Promise<MarketplaceActionResult> {
  if (!featureEnabled()) {
    return { ok: false, error: 'Marketplace nu este activ pentru această flotă.' };
  }

  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  if (!UUID_RE.test(offerId)) {
    return { ok: false, error: 'Oferta este invalidă.' };
  }

  const admin = createAdminClient();
  const { data, error } = await (
    admin as unknown as {
      from: (t: string) => {
        update: (row: Record<string, unknown>) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                select: (cols: string) => {
                  maybeSingle: () => Promise<{
                    data: { id: string; listing_id: string } | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    }
  )
    .from('marketplace_offers')
    .update({
      status: 'WITHDRAWN',
      updated_at: new Date().toISOString(),
    })
    .eq('id', offerId)
    .eq('fleet_id', ctx.fleetId)
    .eq('status', 'PENDING')
    .select('id, listing_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Oferta nu mai poate fi retrasă (acceptată, expirată sau retrasă deja).',
    };
  }

  revalidatePath('/fleet/marketplace');
  revalidatePath('/fleet/marketplace/offers');
  revalidatePath(`/fleet/marketplace/listings/${data.listing_id}`);

  return { ok: true };
}
