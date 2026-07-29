export type MenuBrandRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  cover_url: string | null;
  sort_order: number;
  is_active: boolean;
};

export type MenuBrandActionResult =
  | { ok: true; logo_url: string }
  | { ok: false; error: string; detail?: string };
