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
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
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
          message: kind === 'logo' ? 'Logo actualizat.' : 'Copertă actualizată.',
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
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
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

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
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

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Culoare de brand</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Folosită pe butoanele principale ale storefront-ului (ex. „Comandă"). Format hex #rrggbb.
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
