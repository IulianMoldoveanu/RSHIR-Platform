// Pure types/constants extracted from actions.ts so the 'use server' file only
// exports async functions (Next 14 server-actions constraint).

// `cover_logo` (2026-08-04) is the brand mark drawn over the top-left of the
// cover photo. It is deliberately a separate asset from `logo`, which is the
// round profile picture next to the name — Iulian: "logul vreau sa fie
// pozitionat undeva in stanga sus a paginii de coperta, nu pe poza de profil".
// A restaurant's profile picture is often a dish; their logo is a logo.
export type BrandingKind = 'logo' | 'cover' | 'cover_logo';

export type BrandingState = {
  logo_url: string | null;
  cover_url: string | null;
  cover_logo_url: string | null;
  brand_color: string;
};

export type BrandingActionResult =
  | { ok: true; branding: BrandingState }
  | {
      ok: false;
      error:
        | 'forbidden_owner_only'
        | 'unauthenticated'
        | 'invalid_input'
        | 'tenant_mismatch'
        | 'storage_error'
        | 'db_error';
      detail?: string;
    };

export const DEFAULT_BRAND_COLOR = '#7c3aed';
