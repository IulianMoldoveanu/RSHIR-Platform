'use client';

// Partner self-serve white-label form.
// Edits the same partners.landing_settings jsonb that PLATFORM_ADMIN can edit
// from /dashboard/admin/partners. Validators are shared (server-side); this
// client just collects + previews.
//
// Logo upload note: v1 supports an HTTPS URL only (paste from Cloudinary /
// Imgur / Vercel blob / our Supabase storage / hirforyou.ro). A direct
// file-upload widget would require a new storage bucket + RLS — deferred to
// a follow-up so this PR ships without schema/policy work.

import { useMemo, useState, useTransition } from 'react';
import { updatePartnerBranding } from '../actions';
import {
  PARTNER_LANDING_HOST_ALLOWLIST,
  TAGLINE_MAX,
  TENANT_COUNT_FLOOR_MAX,
} from '@/lib/partner-landing/validators';

type Initial = {
  headline: string;
  blurb: string;
  cta_url: string;
  accent_color: string;
  hero_image_url: string;
  logo_url: string;
  tagline_ro: string;
  tagline_en: string;
  tenant_count_floor: string; // string in the form; parsed on submit
};

const DEFAULTS: Initial = {
  headline: '',
  blurb: '',
  cta_url: '',
  accent_color: '#0f766e',
  hero_image_url: '',
  logo_url: '',
  tagline_ro: '',
  tagline_en: '',
  tenant_count_floor: '',
};

export function BrandingForm({ initial, partnerCode }: { initial: Partial<Initial>; partnerCode: string | null }) {
  const merged: Initial = { ...DEFAULTS, ...initial };
  const [headline, setHeadline] = useState(merged.headline);
  const [blurb, setBlurb] = useState(merged.blurb);
  const [ctaUrl, setCtaUrl] = useState(merged.cta_url);
  const [accentColor, setAccentColor] = useState(merged.accent_color);
  const [heroImageUrl, setHeroImageUrl] = useState(merged.hero_image_url);
  const [logoUrl, setLogoUrl] = useState(merged.logo_url);
  const [taglineRo, setTaglineRo] = useState(merged.tagline_ro);
  const [taglineEn, setTaglineEn] = useState(merged.tagline_en);
  const [tenantCountFloor, setTenantCountFloor] = useState(merged.tenant_count_floor);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const previewUrl = useMemo(() => {
    if (!partnerCode) return null;
    // Best-effort dev hint; the real /r/<code> route lives on restaurant-web.
    const webUrl =
      (typeof window !== 'undefined' && (window as { __HIR_WEB_URL__?: string }).__HIR_WEB_URL__) ||
      'https://hir-restaurant-web.vercel.app';
    return `${webUrl}/r/${partnerCode}`;
  }, [partnerCode]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const parsedFloor = tenantCountFloor.trim();
    let tenantCountFloorNum: number | undefined;
    if (parsedFloor.length > 0) {
      const n = Number(parsedFloor);
      if (!Number.isFinite(n)) {
        setError('Numărul minim de restaurante afișat trebuie să fie un întreg valid.');
        return;
      }
      tenantCountFloorNum = Math.floor(n);
    }

    startTransition(async () => {
      const res = await updatePartnerBranding({
        headline,
        blurb,
        cta_url: ctaUrl,
        accent_color: accentColor,
        hero_image_url: heroImageUrl,
        logo_url: logoUrl,
        tagline_ro: taglineRo,
        tagline_en: taglineEn,
        ...(tenantCountFloorNum !== undefined ? { tenant_count_floor: tenantCountFloorNum } : {}),
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-4"
    >
      {/* ────────── Identitate vizuală ────────── */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Identitate vizuală
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="bf-logo-url" className="text-xs font-medium text-zinc-700">
              Logo (URL public, https://)
            </label>
            <input
              id="bf-logo-url"
              type="url"
              placeholder="https://res.cloudinary.com/..."
              value={logoUrl}
              maxLength={500}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-[11px] text-zinc-500">
              Domenii acceptate:{' '}
              {PARTNER_LANDING_HOST_ALLOWLIST.slice(0, 3).join(', ')} ş.a.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="bf-accent" className="text-xs font-medium text-zinc-700">
              Culoarea brandului
            </label>
            <div className="flex items-center gap-2">
              <input
                id="bf-accent"
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-zinc-300"
                aria-label="Selector de culoare"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                maxLength={7}
                className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                aria-label="Cod hex"
              />
            </div>
          </div>
        </div>

        {logoUrl && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Previzualizare logo</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Previzualizare logo partener"
              className="h-12 w-auto"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
      </fieldset>

      {/* ────────── Mesaj principal ────────── */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Mesaj pe pagina /r/{partnerCode ?? '<cod>'}
        </legend>

        <div className="flex flex-col gap-1">
          <label htmlFor="bf-headline" className="text-xs font-medium text-zinc-700">
            Titlu principal (max. 200 caractere)
          </label>
          <input
            id="bf-headline"
            type="text"
            value={headline}
            maxLength={200}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Ex.: HIR — soluția de comenzi pentru restaurante"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="bf-tagline-ro" className="text-xs font-medium text-zinc-700">
              Sub-titlu (RO, max. {TAGLINE_MAX} caractere)
            </label>
            <input
              id="bf-tagline-ro"
              type="text"
              value={taglineRo}
              maxLength={TAGLINE_MAX}
              onChange={(e) => setTaglineRo(e.target.value)}
              placeholder="Ex.: 1 RON / livrare. Fără abonament."
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="bf-tagline-en" className="text-xs font-medium text-zinc-700">
              Sub-titlu (EN, max. {TAGLINE_MAX} caractere)
            </label>
            <input
              id="bf-tagline-en"
              type="text"
              value={taglineEn}
              maxLength={TAGLINE_MAX}
              onChange={(e) => setTaglineEn(e.target.value)}
              placeholder="E.g.: 1 RON per delivery. No subscription."
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="bf-blurb" className="text-xs font-medium text-zinc-700">
            Descriere (max. 1000 caractere)
          </label>
          <textarea
            id="bf-blurb"
            value={blurb}
            maxLength={1000}
            rows={3}
            onChange={(e) => setBlurb(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="bf-cta" className="text-xs font-medium text-zinc-700">
              CTA URL (https:// sau /pagina-ta)
            </label>
            <input
              id="bf-cta"
              type="text"
              value={ctaUrl}
              maxLength={500}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="/migrate-from-gloriafood"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="bf-hero" className="text-xs font-medium text-zinc-700">
              Imagine hero (URL https://)
            </label>
            <input
              id="bf-hero"
              type="url"
              value={heroImageUrl}
              maxLength={500}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      </fieldset>

      {/* ────────── Tier display ────────── */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Afișare statistici (opțional)
        </legend>
        <div className="flex flex-col gap-1">
          <label htmlFor="bf-floor" className="text-xs font-medium text-zinc-700">
            Număr minim de restaurante afișat (0–{TENANT_COUNT_FLOOR_MAX})
          </label>
          <input
            id="bf-floor"
            type="number"
            min={0}
            max={TENANT_COUNT_FLOOR_MAX}
            step={1}
            value={tenantCountFloor}
            onChange={(e) => setTenantCountFloor(e.target.value)}
            placeholder="ex.: 3"
            className="w-32 rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-[11px] text-zinc-500">
            Util pentru tier-ul de start: dacă ai sub acest prag, /r/{partnerCode ?? '<cod>'} afișează valoarea ca minim social-proof.
          </p>
        </div>
      </fieldset>

      {error && <p className="text-xs text-rose-600">{error}</p>}
      {success && <p className="text-xs text-emerald-600">Branding-ul a fost salvat.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-purple-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {pending ? 'Se salvează...' : 'Salvează branding-ul'}
        </button>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-purple-700 underline-offset-2 hover:underline"
          >
            Deschide pagina ta publică ↗
          </a>
        )}
      </div>
    </form>
  );
}
