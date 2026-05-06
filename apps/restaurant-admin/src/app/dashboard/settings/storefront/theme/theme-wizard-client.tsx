'use client';

// Theme picker wizard (2026-05-07).
// 3 steps: 1) Select theme  2) Preview  3) Confirm & Apply
//
// Step 1 — card grid of all 8 templates with color/font swatches.
// Step 2 — live iframe pointing to the tenant's own storefront with a
//          preview cookie set by previewTheme(). Refreshes when slug changes.
// Step 3 — confirmation card + Apply button → applyTheme() server action.
//
// No custom CSS imports — pure Tailwind. Mobile-first.

import { useState, useTransition, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, Loader2, RotateCcw } from 'lucide-react';
import type { RestaurantTemplate } from '@hir/restaurant-templates';
import { previewTheme, applyTheme } from './actions';

type Step = 'select' | 'preview' | 'confirm';

type Props = {
  tenantId: string;
  tenantSlug: string;
  initialSlug: string | null;
  templates: ReadonlyArray<RestaurantTemplate>;
  canEdit: boolean;
};

type Banner =
  | { kind: 'ok'; message: string }
  | { kind: 'err'; message: string }
  | null;

const FONT_LABEL: Record<string, string> = {
  inter: 'Inter',
  playfair: 'Playfair Display',
  'space-grotesk': 'Space Grotesk',
  fraunces: 'Fraunces',
  oswald: 'Oswald',
};

// Groups: "Style themes" (the 3 new ones) come first for discoverability;
// "Vertical templates" (cuisine-specific) follow.
const STYLE_SLUGS = new Set(['modern-minimal', 'warm-bistro', 'bold-urban']);

export function ThemeWizardClient({
  tenantId,
  tenantSlug,
  initialSlug,
  templates,
  canEdit,
}: Props) {
  const [step, setStep] = useState<Step>('select');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);
  const [appliedSlug, setAppliedSlug] = useState<string | null>(initialSlug);
  const [banner, setBanner] = useState<Banner>(null);
  const [isPending, startTransition] = useTransition();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Derive storefront URL. Uses the primary domain env var if available,
  // falls back to previewing via ?tenant= param on the Vercel URL.
  // The iframe src is kept simple — admin doesn't need tenant subdomain routing.
  const storefrontBase = process.env.NEXT_PUBLIC_STOREFRONT_URL
    ? process.env.NEXT_PUBLIC_STOREFRONT_URL
    : '';
  const previewUrl = storefrontBase
    ? `${storefrontBase}?tenant=${encodeURIComponent(tenantSlug)}&hir_preview=1`
    : null;

  const styleTemplates = templates.filter((t) => STYLE_SLUGS.has(t.slug));
  const verticalTemplates = templates.filter((t) => !STYLE_SLUGS.has(t.slug));

  function showBanner(b: Banner) {
    setBanner(b);
    if (b) window.setTimeout(() => setBanner(null), 5000);
  }

  function handleSelectAndContinue() {
    if (!selectedSlug) return;
    // Fire previewTheme so the storefront sets the preview cookie.
    startTransition(async () => {
      const res = await previewTheme(selectedSlug, tenantId);
      if (!res.ok) {
        showBanner({ kind: 'err', message: errorMessage(res.error) });
        return;
      }
      setStep('preview');
    });
  }

  function handlePreviewContinue() {
    setStep('confirm');
  }

  function handleApply() {
    startTransition(async () => {
      const res = await applyTheme(selectedSlug, tenantId);
      if (!res.ok) {
        showBanner({ kind: 'err', message: errorMessage(res.error) });
        return;
      }
      setAppliedSlug(res.template_slug);
      showBanner({ kind: 'ok', message: 'Tema a fost aplicată pe storefront.' });
      setStep('select');
    });
  }

  function handleReset() {
    startTransition(async () => {
      const res = await applyTheme(null, tenantId);
      if (!res.ok) {
        showBanner({ kind: 'err', message: errorMessage(res.error) });
        return;
      }
      setAppliedSlug(null);
      setSelectedSlug(null);
      showBanner({ kind: 'ok', message: 'Tema a fost resetată la stilul implicit HIR.' });
      setStep('select');
    });
  }

  const selectedTemplate = templates.find((t) => t.slug === selectedSlug) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator */}
      <nav aria-label="Pași wizard temă" className="flex items-center gap-2">
        {(['select', 'preview', 'confirm'] as Step[]).map((s, idx) => {
          const labels = { select: '1. Alege tema', preview: '2. Previzualizare', confirm: '3. Aplică' };
          const isActive = step === s;
          const isDone =
            (s === 'select' && (step === 'preview' || step === 'confirm')) ||
            (s === 'preview' && step === 'confirm');
          return (
            <span
              key={s}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                isActive
                  ? 'bg-purple-600 text-white ring-purple-600'
                  : isDone
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                  : 'bg-zinc-100 text-zinc-500 ring-zinc-200',
              ].join(' ')}
            >
              {isDone ? <Check className="mr-1 inline h-3 w-3" aria-hidden /> : null}
              {labels[s]}
            </span>
          );
        })}
      </nav>

      {/* Banner */}
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

      {/* ── STEP 1: Select ─────────────────────────────────────────────── */}
      {step === 'select' && (
        <>
          {styleTemplates.length > 0 && (
            <section aria-labelledby="style-themes-heading">
              <h2
                id="style-themes-heading"
                className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500"
              >
                Teme de stil
              </h2>
              <TemplateGrid
                templates={styleTemplates}
                selectedSlug={selectedSlug}
                appliedSlug={appliedSlug}
                canEdit={canEdit}
                onSelect={setSelectedSlug}
              />
            </section>
          )}

          <section aria-labelledby="vertical-themes-heading">
            <h2
              id="vertical-themes-heading"
              className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500"
            >
              Template-uri verticale (tip restaurant)
            </h2>
            <TemplateGrid
              templates={verticalTemplates}
              selectedSlug={selectedSlug}
              appliedSlug={appliedSlug}
              canEdit={canEdit}
              onSelect={setSelectedSlug}
            />
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canEdit || !selectedSlug || isPending}
              onClick={handleSelectAndContinue}
              className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
              Previzualizare
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>

            {appliedSlug !== null && canEdit && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden />
                )}
                Resetează la implicit
              </button>
            )}
          </div>

          {!canEdit && (
            <p className="text-sm text-zinc-500">
              Doar OWNER-ul poate modifica tema vizuală.
            </p>
          )}
        </>
      )}

      {/* ── STEP 2: Preview ────────────────────────────────────────────── */}
      {step === 'preview' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-700">
              Storefront-ul de mai jos afișează tema{' '}
              <strong>{selectedTemplate?.name.ro ?? selectedSlug}</strong> în mod previzualizare.
              Clienții văd în continuare tema activă curentă.
            </p>
            <button
              type="button"
              onClick={() => setStep('select')}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi
            </button>
          </div>

          {previewUrl ? (
            <div className="overflow-hidden rounded-xl border border-zinc-300 shadow-sm">
              <div className="flex h-8 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden />
                <span className="ml-2 truncate text-xs text-zinc-400">{previewUrl}</span>
              </div>
              <iframe
                ref={iframeRef}
                src={previewUrl}
                title="Previzualizare storefront cu tema selectată"
                className="h-[520px] w-full border-0 sm:h-[640px]"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
              <p className="font-medium">Previzualizarea iframe nu este disponibilă.</p>
              <p className="mt-1 text-amber-700">
                Configurați{' '}
                <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_STOREFRONT_URL</code>{' '}
                în variabilele de mediu pentru a activa previzualizarea live.
              </p>
            </div>
          )}

          {selectedTemplate && <TemplateDetailCard template={selectedTemplate} />}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePreviewContinue}
              className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Continuă
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setStep('select')}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Schimbă tema
            </button>
          </div>
        </>
      )}

      {/* ── STEP 3: Confirm & Apply ─────────────────────────────────────── */}
      {step === 'confirm' && (
        <>
          <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-5">
            <p className="text-sm font-semibold text-zinc-900">
              Confirmați aplicarea temei pe storefront-ul public
            </p>
            {selectedTemplate ? (
              <div className="mt-3 flex items-center gap-4">
                <div className="flex gap-2">
                  <span
                    aria-hidden
                    className="block h-8 w-8 rounded-md ring-1 ring-inset ring-zinc-200"
                    style={{ backgroundColor: selectedTemplate.branding.brand_color }}
                  />
                  <span
                    aria-hidden
                    className="block h-8 w-8 rounded-md ring-1 ring-inset ring-zinc-200"
                    style={{ backgroundColor: selectedTemplate.branding.accent_color }}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-zinc-900">
                    {selectedTemplate.name.ro}
                  </span>
                  <span className="text-xs text-zinc-500">
                    Titluri: {FONT_LABEL[selectedTemplate.typography.heading_font] ?? selectedTemplate.typography.heading_font}{' '}
                    · Text: {FONT_LABEL[selectedTemplate.typography.body_font] ?? selectedTemplate.typography.body_font}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-700">
                Tema implicită HIR (mov, fără template vertical).
              </p>
            )}
            <p className="mt-3 text-xs text-zinc-600">
              Modificarea este imediată și vizibilă pentru toți utilizatorii storefront-ului.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleApply}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              Aplică tema
            </button>
            <button
              type="button"
              onClick={() => setStep('preview')}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Înapoi la previzualizare
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TemplateGrid({
  templates,
  selectedSlug,
  appliedSlug,
  canEdit,
  onSelect,
}: {
  templates: ReadonlyArray<RestaurantTemplate>;
  selectedSlug: string | null;
  appliedSlug: string | null;
  canEdit: boolean;
  onSelect: (slug: string) => void;
}) {
  return (
    <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((tmpl) => {
        const isSelected = selectedSlug === tmpl.slug;
        const isApplied = appliedSlug === tmpl.slug;
        return (
          <li key={tmpl.slug}>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onSelect(tmpl.slug)}
              aria-pressed={isSelected}
              className={[
                'flex h-full w-full flex-col gap-3 rounded-xl border p-4 text-left shadow-sm transition-colors',
                isSelected
                  ? 'border-purple-400 bg-purple-50/40 ring-2 ring-purple-300'
                  : 'border-zinc-200 bg-white hover:border-purple-300 hover:bg-zinc-50',
                !canEdit ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-zinc-900">{tmpl.name.ro}</span>
                  <span className="text-xs text-zinc-500 line-clamp-2">{tmpl.description.ro}</span>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {isApplied && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                      <Check className="h-2.5 w-2.5" aria-hidden /> Activ
                    </span>
                  )}
                  {isSelected && !isApplied && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-800 ring-1 ring-inset ring-purple-200">
                      Selectat
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2.5">
                <div className="flex flex-col gap-1.5">
                  <span
                    aria-hidden
                    className="block h-5 w-5 rounded-md ring-1 ring-inset ring-zinc-200"
                    style={{ backgroundColor: tmpl.branding.brand_color }}
                  />
                  <span
                    aria-hidden
                    className="block h-5 w-5 rounded-md ring-1 ring-inset ring-zinc-200"
                    style={{ backgroundColor: tmpl.branding.accent_color }}
                  />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">Titluri</span>
                  <span className="truncate text-xs font-semibold text-zinc-900">
                    {FONT_LABEL[tmpl.typography.heading_font] ?? tmpl.typography.heading_font}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">Text</span>
                  <span className="truncate text-xs text-zinc-700">
                    {FONT_LABEL[tmpl.typography.body_font] ?? tmpl.typography.body_font}
                  </span>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TemplateDetailCard({ template }: { template: RestaurantTemplate }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Categorii sugerate
      </p>
      <div className="flex flex-wrap gap-1.5">
        {template.suggested_categories.map((cat) => (
          <span
            key={cat.sort_order}
            className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-200"
          >
            {cat.name.ro}
          </span>
        ))}
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
