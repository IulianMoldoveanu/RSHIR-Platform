// Pure types/constants extracted from actions.ts so the 'use server' file only
// exports async functions (Next 14 server-actions constraint).

export type BrandingKind = 'logo' | 'cover';

export type BrandingState = {
  logo_url: string | null;
  cover_url: string | null;
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
