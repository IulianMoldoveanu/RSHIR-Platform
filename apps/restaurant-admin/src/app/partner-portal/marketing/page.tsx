// /partner-portal/marketing — sales materials library.
//
// Card-grid of marketing assets organised in five sections (testimonials,
// PDF brochures, video pitches, email templates, social media kits) with
// tag search + a "Recent" lane. Static catalog for now: real downloads
// land when Iulian uploads the files; until then the cards are
// download-disabled with a "În pregătire" badge. The catalog itself is
// the contract — wiring is a per-asset href swap.
//
// Search reads ?q= from the URL so the partner can deep-link a filter.
// All work is server-side render (no client JS beyond the search form).

import Link from 'next/link';
import { Search, FileText, Film, Mail, Megaphone, Quote, Download } from 'lucide-react';

export const dynamic = 'force-dynamic';

type AssetKind = 'testimonial' | 'brochure' | 'video' | 'email' | 'social';

type Asset = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  kind: AssetKind;
  /** Download URL — '#' means not yet wired. */
  href: string;
  /** Optional "size" / "duration" / "format" badge text. */
  meta?: string;
  /** Used to surface "Recently used" / "New" badges. */
  flag?: 'new' | 'popular';
};

const ASSETS: Asset[] = [
  // Testimonials
  {
    id: 'testimonial-foisorul-a',
    title: 'Foișorul A (Brașov) — case study video',
    description:
      'Patronul explică cum a redus comisionul Glovo cu 80% în prima lună HIR.',
    tags: ['testimonial', 'video', 'brașov', 'glovo'],
    kind: 'testimonial',
    href: '#',
    meta: '02:14 · MP4',
    flag: 'popular',
  },
  {
    id: 'testimonial-pdf-set',
    title: 'Pachet 5 testimoniale — PDF',
    description:
      'Citate verificate de la 5 restaurante active. Folosește în propuneri scrise.',
    tags: ['testimonial', 'pdf', 'citate'],
    kind: 'testimonial',
    href: '#',
    meta: '1.2 MB · PDF',
  },

  // Brochures
  {
    id: 'pitch-deck-ro',
    title: 'Pitch deck HIR — 8 slide-uri (RO)',
    description: 'Slide deck oficial pentru pitch față-în-față. Editabil în Canva.',
    tags: ['pdf', 'pitch', 'romana', 'restaurant'],
    kind: 'brochure',
    href: '#',
    meta: '3.4 MB · PDF',
    flag: 'new',
  },
  {
    id: 'pitch-deck-en',
    title: 'Pitch deck HIR — 8 slides (EN)',
    description:
      'Pitch deck pentru investitori străini / chains internaționale prezente în România.',
    tags: ['pdf', 'pitch', 'english'],
    kind: 'brochure',
    href: '#',
    meta: '3.4 MB · PDF',
  },
  {
    id: 'comparison-flyer',
    title: 'Comparație HIR vs Glovo/Wolt/Tazz',
    description:
      'Flyer 1-pager cu comisionul real al fiecărui marketplace — calcule verificate.',
    tags: ['pdf', 'comparație', 'glovo', 'wolt'],
    kind: 'brochure',
    href: '#',
    meta: '480 KB · PDF',
    flag: 'popular',
  },

  // Videos
  {
    id: 'elevator-pitch-60s',
    title: 'Elevator pitch 60s',
    description:
      'Versiune scurtă pentru WhatsApp Status și Instagram Stories — fără voce off.',
    tags: ['video', 'short', 'reels'],
    kind: 'video',
    href: '#',
    meta: '01:00 · 9:16 vertical',
  },
  {
    id: 'platform-walkthrough',
    title: 'Walkthrough platformă HIR — 3 min',
    description: 'Tur ghidat al dashboard-ului pentru restaurante. Ușor de partajat.',
    tags: ['video', 'demo', 'walkthrough'],
    kind: 'video',
    href: '#',
    meta: '03:12 · MP4',
  },
  {
    id: 'objection-handling-glovo',
    title: 'Răspuns obiecție „Folosim deja Glovo"',
    description:
      'Răspuns video de 90 secunde pe care îl trimiți direct când primești obiecția.',
    tags: ['video', 'obiecție', 'glovo'],
    kind: 'video',
    href: '#',
    meta: '01:30 · MP4',
  },

  // Email templates
  {
    id: 'email-cold-open',
    title: 'Email cold open — patron HoReCa',
    description:
      'Subiect testat: open-rate 34% pe lista de 200 restaurante București + Brașov.',
    tags: ['email', 'cold', 'horeca'],
    kind: 'email',
    href: '#',
    meta: 'Subject + body',
    flag: 'popular',
  },
  {
    id: 'email-followup-day2',
    title: 'Email follow-up ziua 2',
    description: 'Versiune scurtă, fără anexă — strict pentru reactivare.',
    tags: ['email', 'follow-up'],
    kind: 'email',
    href: '#',
    meta: 'Subject + body',
  },
  {
    id: 'email-post-demo',
    title: 'Email post-demo + recap',
    description:
      'Structurat ca scrisoare-recap cu cifre concrete + următorii 3 pași.',
    tags: ['email', 'post-demo'],
    kind: 'email',
    href: '#',
    meta: 'Subject + body',
  },

  // Social
  {
    id: 'social-instagram-set',
    title: 'Set Instagram — 9 vizuale',
    description:
      'Pachet pentru grid de 9 postări — branding HIR cu loc liber pentru numele tău.',
    tags: ['social', 'instagram', 'imagini'],
    kind: 'social',
    href: '#',
    meta: '9 × 1080×1080 · ZIP',
  },
  {
    id: 'social-linkedin-pack',
    title: 'Set LinkedIn — 5 vizuale + copy',
    description:
      'Postări gata de publicat: 3 educaționale, 1 social proof, 1 CTA referral.',
    tags: ['social', 'linkedin', 'copy'],
    kind: 'social',
    href: '#',
    meta: '5 × 1200×627 · ZIP',
  },
  {
    id: 'social-whatsapp-status',
    title: 'WhatsApp Status — 4 vizuale 9:16',
    description: 'Pachet pentru WhatsApp Status / Instagram Stories.',
    tags: ['social', 'whatsapp', 'vertical'],
    kind: 'social',
    href: '#',
    meta: '4 × 1080×1920 · ZIP',
  },
];

const SECTIONS: { kind: AssetKind; label: string; icon: typeof FileText }[] = [
  { kind: 'testimonial', label: 'Testimoniale', icon: Quote },
  { kind: 'brochure', label: 'Pliante și pitch deck', icon: FileText },
  { kind: 'video', label: 'Video pitch', icon: Film },
  { kind: 'email', label: 'Template-uri e-mail', icon: Mail },
  { kind: 'social', label: 'Social media kit', icon: Megaphone },
];

function matchQuery(a: Asset, q: string): boolean {
  if (!q) return true;
  const needle = q.toLocaleLowerCase('ro-RO');
  return (
    a.title.toLocaleLowerCase('ro-RO').includes(needle) ||
    a.description.toLocaleLowerCase('ro-RO').includes(needle) ||
    a.tags.some((t) => t.includes(needle))
  );
}

export default async function MarketingLibraryPage({
  searchParams,
}: {
  // Next 15: searchParams is async
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();

  const visible = ASSETS.filter((a) => matchQuery(a, q));
  const recent = ASSETS.filter((a) => a.flag === 'popular' || a.flag === 'new');

  return (
    <div className="flex flex-col gap-8 pb-20 lg:pb-0">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
          Materiale de promovare
        </h1>
        <p className="text-sm text-zinc-600">
          Tot ce ai nevoie ca să prezinți HIR profesionist: pitch deck-uri,
          comparații cu marketplace-urile, testimoniale, video și template-uri
          e-mail. Caută după etichetă (ex. „glovo", „pdf", „testimonial").
        </p>
      </header>

      {/* Search form (URL-driven, server-rendered) */}
      <form
        method="get"
        role="search"
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        aria-label="Caută în biblioteca de materiale"
      >
        <label className="relative flex-1">
          <span className="sr-only">Termen de căutare</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Caută după nume, descriere sau etichetă…"
            className="w-full rounded-md border border-zinc-200 bg-white py-2.5 pl-10 pr-3 text-sm placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
        >
          Caută
        </button>
        {q ? (
          <Link
            href="/partner-portal/marketing"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Resetează
          </Link>
        ) : null}
      </form>

      {/* Recent / popular */}
      {!q && recent.length > 0 ? (
        <section aria-label="Cele mai folosite">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            Cele mai folosite
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        </section>
      ) : null}

      {/* By section, or all matches if a query is active */}
      {q ? (
        <section aria-label={`Rezultate pentru "${q}"`}>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            {visible.length} rezultat{visible.length === 1 ? '' : 'e'} pentru „{q}"
          </h2>
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
              <p className="text-sm text-zinc-500">
                Nimic găsit. Încearcă cu „pdf", „video", „testimonial" sau „glovo".
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((a) => (
                <AssetCard key={a.id} asset={a} />
              ))}
            </div>
          )}
        </section>
      ) : (
        SECTIONS.map((section) => {
          const items = ASSETS.filter((a) => a.kind === section.kind);
          if (items.length === 0) return null;
          const Icon = section.icon;
          return (
            <section key={section.kind} aria-label={section.label}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <Icon className="h-4 w-4 text-purple-700" aria-hidden />
                {section.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((a) => (
                  <AssetCard key={a.id} asset={a} />
                ))}
              </div>
            </section>
          );
        })
      )}

      <p className="text-xs text-zinc-400">
        Materialele descărcate sunt licențiate pentru promovarea HIR de către
        partenerul logat. Nu redistribui către terți fără acord scris.
      </p>
    </div>
  );
}

function AssetCard({ asset }: { asset: Asset }) {
  const disabled = asset.href === '#';
  return (
    <article className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{asset.title}</h3>
        {asset.flag === 'new' ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            Nou
          </span>
        ) : asset.flag === 'popular' ? (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Top
          </span>
        ) : null}
      </div>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-zinc-600">
        {asset.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        {asset.tags.slice(0, 4).map((t) => (
          <span
            key={t}
            className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600"
          >
            #{t}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{asset.meta ?? '—'}</span>
        {disabled ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">
            În pregătire
          </span>
        ) : (
          <a
            href={asset.href}
            aria-label={`Descarcă ${asset.title}`}
            className="inline-flex items-center gap-1 rounded-md bg-purple-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1"
          >
            <Download className="h-3 w-3" aria-hidden />
            Descarcă
          </a>
        )}
      </div>
    </article>
  );
}
