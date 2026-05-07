// Pure helpers for `/r/[code]/page.tsx` — extracted so they can be unit-tested
// without booting Next.js. Mirrors the inline helpers in page.tsx; if you
// change one, change the other.

export const IMAGE_HOST_ALLOWLIST = new Set<string>([
  'public.blob.vercel-storage.com',
  'images.unsplash.com',
  'res.cloudinary.com',
  'i.imgur.com',
  'qfmeojeipncuxeltnvab.supabase.co',
  'hirforyou.ro',
]);

export function safeImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!IMAGE_HOST_ALLOWLIST.has(u.hostname)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function pickLocale(acceptLanguage: string | null): 'ro' | 'en' {
  if (!acceptLanguage) return 'ro';
  const first = acceptLanguage.split(',')[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('en')) return 'en';
  return 'ro';
}

// Pick the matching tagline given the active locale. Falls back to the other
// language if the requested one is empty (so partners can ship RO-only and
// EN visitors still see a tagline).
export function pickTagline(
  locale: 'ro' | 'en',
  taglineRo: unknown,
  taglineEn: unknown,
): string | null {
  const ro = typeof taglineRo === 'string' ? taglineRo : '';
  const en = typeof taglineEn === 'string' ? taglineEn : '';
  const primary = locale === 'en' ? en : ro;
  const secondary = locale === 'en' ? ro : en;
  const chosen = primary || secondary;
  if (!chosen) return null;
  if (chosen.length > 140) return null;
  return chosen;
}
