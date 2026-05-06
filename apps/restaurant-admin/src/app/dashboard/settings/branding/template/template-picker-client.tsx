'use client';

// Lane THEMES (2026-05-06): preview cards + activate button. One server
// action call per click — optimistic state plus a toast-style banner that
// fades after 4s. No drag handles, no preview-iframe — KISS for v1.

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { RestaurantTemplate } from '@hir/restaurant-templates';
import { setTemplateSlug } from './actions';

type Props = {
  tenantId: string;
  initialSlug: string | null;
  templates: ReadonlyArray<RestaurantTemplate>;
  canEdit: boolean;
};

type Banner =
  | { kind: 'ok'; message: string }
  | { kind: 'err'; message: string }
  | null;

export function TemplatePickerClient({ tenantId, initialSlug, templates, canEdit }: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(initialSlug);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [isPending, startTransition] = useTransition();

  function activate(slug: string) {
    if (!canEdit || isPending || slug === activeSlug) return;
    setPendingSlug(slug);
    startTransition(async () => {
      const res = await setTemplateSlug(slug, tenantId);
      setPendingSlug(null);
      if (res.ok) {
        setActiveSlug(res.template_slug);
        setBanner({
          kind: 'ok',
          message: 'Tema a fost activată. Deschideți storefront-ul ca să o vedeți.',
        });
      } else {
        setBanner({
          kind: 'err',
          message: errorMessage(res.error),
        });
      }
      window.setTimeout(() => setBanner(null), 4000);
    });
  }

  function resetToDefault() {
    if (!canEdit || isPending || activeSlug === null) return;
    setPendingSlug('__default__');
    startTransition(async () => {
      const res = await setTemplateSlug(null, tenantId);
      setPendingSlug(null);
      if (res.ok) {
        setActiveSlug(null);
        setBanner({
          kind: 'ok',
          message: 'Tema a fost resetată la stilul implicit HIR.',
        });
      } else {
        setBanner({
          kind: 'err',
          message: errorMessage(res.error),
        });
      }
      window.setTimeout(() => setBanner(null), 4000);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {banner && (
        <div
          role="status"
          className={
            banner.kind === 'ok'
              ? 'rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800'
              : 'rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800'
          }
        >
          {banner.message}
        </div>
      )}

      <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tmpl) => {
          const isActive = activeSlug === tmpl.slug;
          const isThisPending = pendingSlug === tmpl.slug;
          return (
            <li key={tmpl.slug}>
              <article
                className={
                  'flex h-full flex-col gap-3 rounded-xl border p-4 shadow-sm transition-colors ' +
                  (isActive
                    ? 'border-purple-400 bg-purple-50/40 ring-1 ring-purple-200'
                    : 'border-zinc-200 bg-white')
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-zinc-900">{tmpl.name.ro}</span>
                    <span className="text-xs text-zinc-600">{tmpl.description.ro}</span>
                  </div>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                      <Check className="h-3 w-3" aria-hidden /> Activ
                    </span>
                  )}
                </div>

                <ColorAndFontPreview template={tmpl} />

                <div className="mt-1 flex flex-wrap gap-2">
                  {tmpl.suggested_categories.slice(0, 4).map((cat) => (
                    <span
                      key={cat.sort_order}
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 ring-1 ring-inset ring-zinc-200"
                    >
                      {cat.name.ro}
                    </span>
                  ))}
                </div>

                <div className="mt-auto pt-2">
                  <button
                    type="button"
                    disabled={!canEdit || isPending || isActive}
                    onClick={() => activate(tmpl.slug)}
                    className={
                      'inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
                      (isActive
                        ? 'cursor-default bg-emerald-600 text-white'
                        : !canEdit || isPending
                        ? 'cursor-not-allowed bg-zinc-100 text-zinc-500'
                        : 'bg-purple-600 text-white hover:bg-purple-700')
                    }
                  >
                    {isThisPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se activează…
                      </>
                    ) : isActive ? (
                      'Tema activă'
                    ) : (
                      'Activează'
                    )}
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {activeSlug !== null && canEdit && (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-zinc-700">
              Doriți să reveniți la stilul implicit HIR (mov, fără temă verticală)?
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={resetToDefault}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingSlug === '__default__' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se resetează…
                </>
              ) : (
                'Resetează la implicit'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorAndFontPreview({ template }: { template: RestaurantTemplate }) {
  const fontLabel: Record<string, string> = {
    inter: 'Inter',
    playfair: 'Playfair Display',
    'space-grotesk': 'Space Grotesk',
    fraunces: 'Fraunces',
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex flex-col gap-1.5">
        <span
          aria-hidden
          className="block h-6 w-6 rounded-md ring-1 ring-inset ring-zinc-200"
          style={{ backgroundColor: template.branding.brand_color }}
        />
        <span
          aria-hidden
          className="block h-6 w-6 rounded-md ring-1 ring-inset ring-zinc-200"
          style={{ backgroundColor: template.branding.accent_color }}
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[11px] uppercase tracking-wide text-zinc-500">
          Titluri
        </span>
        <span className="truncate text-sm font-semibold text-zinc-900">
          {fontLabel[template.typography.heading_font] ?? template.typography.heading_font}
        </span>
        <span className="truncate text-[11px] uppercase tracking-wide text-zinc-500">
          Text
        </span>
        <span className="truncate text-xs text-zinc-700">
          {fontLabel[template.typography.body_font] ?? template.typography.body_font}
        </span>
      </div>
    </div>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case 'forbidden_owner_only':
      return 'Doar OWNER-ul poate schimba tema.';
    case 'unauthenticated':
      return 'Sesiune expirată. Reîncărcați pagina.';
    case 'tenant_mismatch':
      return 'Restaurantul activ s-a schimbat. Reîncărcați pagina.';
    case 'invalid_slug':
      return 'Temă necunoscută.';
    default:
      return 'Eroare la salvare. Încercați din nou.';
  }
}
