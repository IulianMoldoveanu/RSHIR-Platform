'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBrandColor, uploadBrandingAsset } from './actions';
import type {
  BrandingActionResult,
  BrandingKind,
  BrandingState,
} from './types';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
// Must stay in lockstep with ALLOWED_MIME in actions.ts. SVG was offered here
// long after the server stopped accepting it (RSHIR-31 H-3 dropped it because
// an SVG can carry <script>/<foreignObject> that runs when the storage URL is
// opened directly), so an owner could pick their logo.svg, wait for the upload
// and get back "Date invalide. (mime_not_allowed:image/svg+xml)" with no hint
// that the format was never going to work. Fixed 2026-08-04.
const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_BYTES = 4 * 1024 * 1024;

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function errorLabel(result: Extract<BrandingActionResult, { ok: false }>): string {
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate modifica.',
    unauthenticated: 'Sesiune expirată — autentifică-te din nou.',
    invalid_input: 'Date invalide.',
    tenant_mismatch: 'Restaurantul activ s-a schimbat — reîncarcă pagina.',
    storage_error: 'Eroare la upload în storage.',
    db_error: 'Eroare la salvarea în baza de date.',
  };
  const base = map[result.error] ?? result.error;
  return result.detail ? `${base} (${result.detail})` : base;
}

export function BrandingClient({
  initial,
  canEdit,
  tenantId,
}: {
  initial: BrandingState;
  canEdit: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<BrandingState>(initial);
  const [color, setColor] = useState(initial.brand_color);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverLogoInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState<BrandingKind | null>(null);

  function handleFile(kind: BrandingKind, file: File | null | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setFeedback({ kind: 'error', message: 'Fișierul depășește 4 MB.' });
      return;
    }
    setFeedback(null);
    start(async () => {
      const fd = new FormData();
      fd.set('kind', kind);
      fd.set('file', file);
      fd.set('tenantId', tenantId);
      const result = await uploadBrandingAsset(fd);
      if (result.ok) {
        setState(result.branding);
        setFeedback({
          kind: 'success',
          message:
            kind === 'logo'
              ? 'Logo actualizat.'
              : kind === 'cover'
              ? 'Copertă actualizată.'
              : 'Logo peste copertă actualizat.',
        });
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(result) });
      }
    });
  }

  function saveColor() {
    if (!HEX_RE.test(color)) {
      setFeedback({ kind: 'error', message: 'Culoare invalidă. Folosește format #rrggbb.' });
      return;
    }
    setFeedback(null);
    start(async () => {
      const result = await setBrandColor(color.toLowerCase(), tenantId);
      if (result.ok) {
        setState(result.branding);
        setFeedback({ kind: 'success', message: 'Culoare salvată.' });
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(result) });
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Logo</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Apare în antetul storefront-ului. Recomandat: pătrat, min. 256×256, PNG/SVG cu fundal transparent. Max 4 MB.
        </p>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div
            className={`flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 ${
              dragOver === 'logo' ? 'border-zinc-900 bg-zinc-100' : 'border-dashed border-zinc-300 bg-zinc-50'
            }`}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOver('logo');
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOver(null);
              handleFile('logo', e.dataTransfer.files?.[0]);
            }}
          >
            {state.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.logo_url}
                alt="Logo curent"
                width={112}
                height={112}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs text-zinc-500">Niciun logo</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={logoInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => handleFile('logo', e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={!canEdit || pending}
              onClick={() => logoInputRef.current?.click()}
              className="self-start rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {state.logo_url ? 'Înlocuiește logo' : 'Încarcă logo'}
            </button>
            <p className="text-xs text-zinc-500">
              Sau trage fișierul peste pătratul din stânga.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Imagine de copertă</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Banner mare deasupra meniului. Recomandat 16:9 (ex. 1600×900). Orice raport e acceptat — afișarea se face cu object-fit. Max 4 MB.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div
            className={`flex h-44 w-full items-center justify-center overflow-hidden rounded-lg border-2 ${
              dragOver === 'cover' ? 'border-zinc-900 bg-zinc-100' : 'border-dashed border-zinc-300 bg-zinc-50'
            }`}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOver('cover');
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOver(null);
              handleFile('cover', e.dataTransfer.files?.[0]);
            }}
          >
            {state.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.cover_url}
                alt="Copertă curentă"
                width={800}
                height={176}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs text-zinc-500">Nicio copertă</span>
            )}
          </div>

          <input
            ref={coverInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => handleFile('cover', e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={() => coverInputRef.current?.click()}
            className="self-start rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {state.cover_url ? 'Înlocuiește copertă' : 'Încarcă copertă'}
          </button>
        </div>
      </section>

      {/* 2026-08-04 — the brand mark, as distinct from the round profile
          picture above. Restaurants routinely use a photo of a dish as their
          profile picture, so there was nowhere for an actual logo to go.
          This one is drawn over the top-left of the cover on the storefront,
          and the demo marks that spot with a "YOUR LOGO" placeholder so a
          prospect can see it before they have an account. */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Logo peste copertă</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Apare în colțul din stânga-sus al copertei, peste imagine. Recomandat: PNG cu fundal
          transparent, orizontal (ex. 400×140). Se afișează la 40 px înălțime, maximum 140 px
          lățime. Max 4 MB. Dacă nu încarci nimic, colțul rămâne gol — clienții nu văd niciun
          substituent.
        </p>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Checkerboard behind the preview: this asset is normally a
              transparent PNG sitting on a photo, and a white box would hide
              exactly the mistake an owner needs to catch — a logo exported
              with an opaque white background. */}
          <div
            className={`flex h-24 w-44 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 ${
              dragOver === 'cover_logo'
                ? 'border-zinc-900 bg-zinc-100'
                : 'border-dashed border-zinc-300'
            }`}
            style={{
              backgroundImage:
                'linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)',
              backgroundSize: '12px 12px',
              backgroundPosition: '0 0,0 6px,6px -6px,-6px 0',
            }}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOver('cover_logo');
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOver(null);
              handleFile('cover_logo', e.dataTransfer.files?.[0]);
            }}
          >
            {state.cover_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.cover_logo_url}
                alt="Logo peste copertă curent"
                width={176}
                height={96}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-xs text-zinc-500">Niciun logo</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={coverLogoInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => handleFile('cover_logo', e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={!canEdit || pending}
              onClick={() => coverLogoInputRef.current?.click()}
              className="self-start rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {state.cover_logo_url ? 'Înlocuiește logo' : 'Încarcă logo'}
            </button>
            <p className="text-xs text-zinc-500">
              Sau trage fișierul peste dreptunghiul din stânga.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Culoare de brand</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Folosită pe butoanele principale ale storefront-ului (ex. „Comandă”). Format hex #rrggbb.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="color"
            disabled={!canEdit}
            value={HEX_RE.test(color) ? color : '#7c3aed'}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-md border border-zinc-300 disabled:opacity-50"
          />
          <input
            type="text"
            disabled={!canEdit}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#7c3aed"
            maxLength={7}
            className="w-32 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm uppercase focus:border-zinc-900 focus:outline-none"
          />
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={saveColor}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            Salvează culoarea
          </button>
          <span
            aria-hidden
            className="inline-flex h-10 items-center rounded-md px-4 text-xs font-semibold text-white"
            style={{ backgroundColor: HEX_RE.test(color) ? color : '#7c3aed' }}
          >
            Previzualizare
          </span>
        </div>
      </section>

      {feedback && (
        <p
          className={
            feedback.kind === 'success'
              ? 'text-xs text-emerald-700'
              : 'text-xs text-rose-700'
          }
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
