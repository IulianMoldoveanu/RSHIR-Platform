'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadMenuBrandLogo } from './actions';
import type { MenuBrandActionResult, MenuBrandRow } from './types';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_BYTES = 4 * 1024 * 1024;

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function errorLabel(result: Extract<MenuBrandActionResult, { ok: false }>): string {
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

function BrandLogoUploader({
  brand,
  canEdit,
  tenantId,
}: {
  brand: MenuBrandRow;
  canEdit: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [logoUrl, setLogoUrl] = useState(brand.logo_url);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setFeedback({ kind: 'error', message: 'Fișierul depășește 4 MB.' });
      return;
    }
    setFeedback(null);
    start(async () => {
      const fd = new FormData();
      fd.set('brandId', brand.id);
      fd.set('file', file);
      fd.set('tenantId', tenantId);
      const result = await uploadMenuBrandLogo(fd);
      if (result.ok) {
        setLogoUrl(result.logo_url);
        setFeedback({ kind: 'success', message: 'Siglă actualizată.' });
        router.refresh();
      } else {
        setFeedback({ kind: 'error', message: errorLabel(result) });
      }
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">{brand.name}</h2>
        {!brand.is_active && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
            Inactiv
          </span>
        )}
      </div>
      {brand.tagline && <p className="mt-0.5 text-xs text-zinc-500">{brand.tagline}</p>}

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 ${
            dragOver ? 'border-zinc-900 bg-zinc-100' : 'border-dashed border-zinc-300 bg-zinc-50'
          }`}
          onDragOver={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" width={80} height={80} className="h-full w-full object-cover" />
          ) : (
            <span className="text-center text-[11px] text-zinc-500">Nicio siglă</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={() => inputRef.current?.click()}
            className="self-start rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {logoUrl ? 'Înlocuiește sigla' : 'Încarcă siglă'}
          </button>
          <p className="text-xs text-zinc-500">Pătrat, min. 128×128. Max 4 MB.</p>
        </div>
      </div>

      {feedback && (
        <p className={`mt-3 text-xs ${feedback.kind === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
          {feedback.message}
        </p>
      )}
    </section>
  );
}

export function MenuBrandsClient({
  brands,
  canEdit,
  tenantId,
}: {
  brands: MenuBrandRow[];
  canEdit: boolean;
  tenantId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {brands.map((brand) => (
        <BrandLogoUploader key={brand.id} brand={brand} canEdit={canEdit} tenantId={tenantId} />
      ))}
    </div>
  );
}
