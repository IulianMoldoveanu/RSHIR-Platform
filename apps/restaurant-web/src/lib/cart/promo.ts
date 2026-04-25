// RSHIR-33: lightweight client-side promo state. The CheckoutClient writes
// the applied promo to sessionStorage so the global CartDrawer (which lives
// outside the checkout subtree) can show a "Reducere — XX RON" preview.
// The server always re-validates and recomputes the discount at quote +
// intent time; this helper is preview-only.

const KEY = 'hir_applied_promo';

export type StoredPromo = {
  code: string;
  kind: 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';
  value_int: number;
};

export function readStoredPromo(): StoredPromo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPromo>;
    if (
      typeof parsed.code !== 'string' ||
      (parsed.kind !== 'PERCENT' && parsed.kind !== 'FIXED' && parsed.kind !== 'FREE_DELIVERY') ||
      typeof parsed.value_int !== 'number'
    ) {
      return null;
    }
    return { code: parsed.code, kind: parsed.kind, value_int: parsed.value_int };
  } catch {
    return null;
  }
}

export function writeStoredPromo(p: StoredPromo | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (p === null) {
      window.sessionStorage.removeItem(KEY);
    } else {
      window.sessionStorage.setItem(KEY, JSON.stringify(p));
    }
    window.dispatchEvent(new CustomEvent('hir:applied-promo-changed'));
  } catch {
    // Storage may be unavailable (private mode); silently no-op.
  }
}

/**
 * Client-side preview of the discount. Mirrors the server-side discountFor()
 * formula. NOT authoritative — the server's quote/intent always wins.
 */
export function previewDiscount(
  promo: StoredPromo,
  subtotalRon: number,
  deliveryFeeRon: number,
): number {
  if (promo.kind === 'PERCENT') {
    return round2(Math.min((subtotalRon * promo.value_int) / 100, subtotalRon));
  }
  if (promo.kind === 'FIXED') {
    return round2(Math.min(promo.value_int, subtotalRon));
  }
  return round2(deliveryFeeRon);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
