// Lane PRESENTATION (2026-05-06) — admin types for the optional brand
// presentation page editor.

export type PresentationGalleryItem = {
  url: string;
  alt?: string | null;
  caption?: string | null;
};

export type PresentationTeamMember = {
  name: string;
  role?: string | null;
  photo_url?: string | null;
};

export type PresentationSocials = {
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
};

export type PresentationState = {
  enabled: boolean;
  about_long: string | null;
  gallery: PresentationGalleryItem[];
  team: PresentationTeamMember[];
  video_url: string | null;
  socials: PresentationSocials;
};

export const EMPTY_PRESENTATION_STATE: PresentationState = {
  enabled: false,
  about_long: null,
  gallery: [],
  team: [],
  video_url: null,
  socials: {
    instagram: null,
    facebook: null,
    tiktok: null,
    youtube: null,
  },
};

export type PresentationActionResult =
  | { ok: true; state: PresentationState }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden_owner_only'
        | 'tenant_mismatch'
        | 'invalid_input'
        | 'storage_error'
        | 'db_error';
      detail?: string;
    };
