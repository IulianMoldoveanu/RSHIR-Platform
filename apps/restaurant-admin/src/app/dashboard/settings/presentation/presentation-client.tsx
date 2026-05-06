'use client';

// Lane PRESENTATION (2026-05-06) — admin editor for the optional brand
// presentation page (`/poveste`). Single-form save: state is held locally
// then pushed via `savePresentation`. Image upload is a separate action so
// large files don't ride along with each form save.

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { savePresentation, uploadPresentationImage } from './actions';
import type {
  PresentationActionResult,
  PresentationGalleryItem,
  PresentationState,
  PresentationTeamMember,
} from './types';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

function errorLabel(result: Extract<PresentationActionResult, { ok: false }>): string {
  const map: Record<string, string> = {
    forbidden_owner_only: 'Doar OWNER poate modifica.',
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    invalid_input: 'Date invalide.',
    tenant_mismatch: 'Restaurantul activ s-a schimbat — reîncărcați pagina.',
    storage_error: 'Eroare la upload în storage.',
    db_error: 'Eroare la salvarea în baza de date.',
  };
  const base = map[result.error] ?? result.error;
  return result.detail ? `${base} (${result.detail})` : base;
}

export function PresentationClient({
  initial,
  canEdit,
  tenantId,
  povesteUrl,
}: {
  initial: PresentationState;
  canEdit: boolean;
  tenantId: string;
  povesteUrl: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<PresentationState>(initial);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const teamPhotoInputRef = useRef<HTMLInputElement>(null);
  const [pendingTeamIndex, setPendingTeamIndex] = useState<number | null>(null);

  function update<K extends keyof PresentationState>(key: K, value: PresentationState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function updateSocial(key: keyof PresentationState['socials'], value: string) {
    setState((s) => ({
      ...s,
      socials: { ...s.socials, [key]: value.trim() ? value.trim() : null },
    }));
  }

  function addTeam() {
    setState((s) => ({
      ...s,
      team: [...s.team, { name: '', role: null, photo_url: null }],
    }));
  }

  function updateTeam(idx: number, patch: Partial<PresentationTeamMember>) {
    setState((s) => ({
      ...s,
      team: s.team.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));
  }

  function removeTeam(idx: number) {
    setState((s) => ({ ...s, team: s.team.filter((_, i) => i !== idx) }));
  }

  function moveGallery(idx: number, dir: -1 | 1) {
    setState((s) => {
      const next = [...s.gallery];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return s;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...s, gallery: next };
    });
  }

  function removeGalleryItem(idx: number) {
    setState((s) => ({ ...s, gallery: s.gallery.filter((_, i) => i !== idx) }));
  }

  function updateGalleryItem(idx: number, patch: Partial<PresentationGalleryItem>) {
    setState((s) => ({
      ...s,
      gallery: s.gallery.map((g, i) => (i === idx ? { ...g, ...patch } : g)),
    }));
  }

  async function uploadImage(
    file: File,
    kind: 'gallery' | 'team',
  ): Promise<string | null> {
    const fd = new FormData();
    fd.set('file', file);
    fd.set('tenantId', tenantId);
    fd.set('kind', kind);
    const result = await uploadPresentationImage(fd);
    if (!result.ok) {
      setFeedback({
        kind: 'error',
        message: `Upload eșuat: ${result.detail ?? result.error}`,
      });
      return null;
    }
    return result.url;
  }

  function handleGalleryFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setFeedback(null);
    start(async () => {
      const newItems: PresentationGalleryItem[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadImage(file, 'gallery');
        if (url) newItems.push({ url, alt: null, caption: null });
      }
      if (newItems.length > 0) {
        setState((s) => ({
          ...s,
          gallery: [...s.gallery, ...newItems].slice(0, 24),
        }));
        setFeedback({ kind: 'success', message: `${newItems.length} imagine(i) încărcate.` });
      }
    });
  }

  function handleTeamPhoto(file: File | null) {
    if (!file || pendingTeamIndex === null) return;
    const idx = pendingTeamIndex;
    setFeedback(null);
    start(async () => {
      const url = await uploadImage(file, 'team');
      if (url) {
        updateTeam(idx, { photo_url: url });
        setFeedback({ kind: 'success', message: 'Fotografie încărcată.' });
      }
      setPendingTeamIndex(null);
    });
  }

  function handleSave() {
    setFeedback(null);
    start(async () => {
      const result = await savePresentation(state, tenantId);
      if (!result.ok) {
        setFeedback({ kind: 'error', message: errorLabel(result) });
        return;
      }
      setState(result.state);
      setFeedback({ kind: 'success', message: 'Modificările au fost salvate.' });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Toggle */}
      <section className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">Pagina de prezentare</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Activați o pagină separată de magazin la adresa{' '}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-[12px]">/poveste</code>{' '}
            unde puteți spune povestea restaurantului, prezenta echipa și galerie de imagini.
          </p>
          {state.enabled && (
            <a
              href={povesteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-purple-700 hover:underline"
            >
              Vezi pagina <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>
        <label className="relative inline-flex flex-none cursor-pointer items-center">
          <input
            type="checkbox"
            checked={state.enabled}
            disabled={!canEdit || pending}
            onChange={(e) => update('enabled', e.target.checked)}
            className="peer sr-only"
          />
          <span className="block h-6 w-11 rounded-full bg-zinc-300 transition-colors peer-checked:bg-purple-600 peer-disabled:opacity-50"></span>
          <span className="absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"></span>
        </label>
      </section>

      {/* About long */}
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <header className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-zinc-900">Despre noi</h2>
          <p className="text-xs text-zinc-600">
            Povestea restaurantului. Suportă <strong>**bold**</strong>, <em>*italic*</em> și{' '}
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-[11px]">[link](https://...)</code>.
            Maxim 8.000 de caractere.
          </p>
        </header>
        <textarea
          value={state.about_long ?? ''}
          onChange={(e) => update('about_long', e.target.value || null)}
          disabled={!canEdit || pending}
          rows={10}
          maxLength={8000}
          placeholder="Suntem un restaurant tradițional cu rădăcini în..."
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
        />
        <p className="text-right text-xs text-zinc-500">
          {(state.about_long ?? '').length} / 8000
        </p>
      </section>

      {/* Gallery */}
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <header className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-zinc-900">
            <ImageIcon className="mr-1.5 inline-block h-4 w-4 align-text-top text-zinc-500" aria-hidden />
            Galerie ({state.gallery.length} / 24)
          </h2>
          <p className="text-xs text-zinc-600">
            Imagini PNG/JPG/WebP, maxim 4 MB fiecare. Trageți pentru reordonare.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={!canEdit || pending || state.gallery.length >= 24}
            className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-3.5 w-3.5" aria-hidden />
            )}
            Încarcă imagini
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleGalleryFiles(e.target.files)}
          />
        </div>

        {state.gallery.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {state.gallery.map((item, idx) => (
              <li
                key={`${item.url}-${idx}`}
                className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.alt ?? ''}
                  className="aspect-square w-full rounded object-cover"
                  loading="lazy"
                />
                <input
                  type="text"
                  placeholder="Descriere (alt)"
                  value={item.alt ?? ''}
                  disabled={!canEdit || pending}
                  onChange={(e) => updateGalleryItem(idx, { alt: e.target.value || null })}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
                />
                <input
                  type="text"
                  placeholder="Subtitrare"
                  value={item.caption ?? ''}
                  disabled={!canEdit || pending}
                  onChange={(e) => updateGalleryItem(idx, { caption: e.target.value || null })}
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50"
                />
                <div className="flex items-center justify-between gap-1 text-xs">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveGallery(idx, -1)}
                      disabled={!canEdit || pending || idx === 0}
                      className="rounded border border-zinc-200 px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30"
                      aria-label="Mută la stânga"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => moveGallery(idx, 1)}
                      disabled={!canEdit || pending || idx === state.gallery.length - 1}
                      className="rounded border border-zinc-200 px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30"
                      aria-label="Mută la dreapta"
                    >
                      →
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGalleryItem(idx)}
                    disabled={!canEdit || pending}
                    className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Șterge
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Team */}
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              <Users className="mr-1.5 inline-block h-4 w-4 align-text-top text-zinc-500" aria-hidden />
              Echipa noastră ({state.team.length} / 12)
            </h2>
            <p className="mt-1 text-xs text-zinc-600">
              Opțional. Adăugați colegi pe care doriți să-i prezentați.
            </p>
          </div>
          <button
            type="button"
            onClick={addTeam}
            disabled={!canEdit || pending || state.team.length >= 12}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Adaugă persoană
          </button>
        </header>

        {state.team.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {state.team.map((member, idx) => (
              <li
                key={`team-${idx}`}
                className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3"
              >
                <div className="flex items-center gap-3">
                  {member.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.photo_url}
                      alt=""
                      className="h-12 w-12 flex-none rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500">
                      foto
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPendingTeamIndex(idx);
                      teamPhotoInputRef.current?.click();
                    }}
                    disabled={!canEdit || pending}
                    className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {member.photo_url ? 'Schimbă' : 'Încarcă'} foto
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTeam(idx)}
                    disabled={!canEdit || pending}
                    className="ml-auto inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden /> Șterge
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Nume"
                  value={member.name}
                  disabled={!canEdit || pending}
                  onChange={(e) => updateTeam(idx, { name: e.target.value })}
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
                />
                <input
                  type="text"
                  placeholder="Rol (ex. Bucătar-șef)"
                  value={member.role ?? ''}
                  disabled={!canEdit || pending}
                  onChange={(e) => updateTeam(idx, { role: e.target.value || null })}
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm disabled:opacity-50"
                />
              </li>
            ))}
          </ul>
        )}
        <input
          ref={teamPhotoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleTeamPhoto(e.target.files?.[0] ?? null)}
        />
      </section>

      {/* Video */}
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <header className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-zinc-900">Video (opțional)</h2>
          <p className="text-xs text-zinc-600">
            Lipiți un link YouTube sau Vimeo. Doar acestea sunt acceptate pentru a vă proteja
            vizitatorii.
          </p>
        </header>
        <input
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={state.video_url ?? ''}
          disabled={!canEdit || pending}
          onChange={(e) => update('video_url', e.target.value || null)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
        />
      </section>

      {/* Socials */}
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <header className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-zinc-900">Rețele sociale</h2>
          <p className="text-xs text-zinc-600">Lăsați gol dacă nu doriți să afișați o rețea.</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Instagram
            <input
              type="url"
              inputMode="url"
              placeholder="https://instagram.com/..."
              value={state.socials.instagram ?? ''}
              disabled={!canEdit || pending}
              onChange={(e) => updateSocial('instagram', e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            Facebook
            <input
              type="url"
              inputMode="url"
              placeholder="https://facebook.com/..."
              value={state.socials.facebook ?? ''}
              disabled={!canEdit || pending}
              onChange={(e) => updateSocial('facebook', e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            TikTok
            <input
              type="url"
              inputMode="url"
              placeholder="https://www.tiktok.com/@..."
              value={state.socials.tiktok ?? ''}
              disabled={!canEdit || pending}
              onChange={(e) => updateSocial('tiktok', e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-700">
            YouTube
            <input
              type="url"
              inputMode="url"
              placeholder="https://youtube.com/@..."
              value={state.socials.youtube ?? ''}
              disabled={!canEdit || pending}
              onChange={(e) => updateSocial('youtube', e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
        </div>
      </section>

      {/* Save */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {feedback && (
          <p
            role="status"
            className={`text-sm ${
              feedback.kind === 'success' ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {feedback.message}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canEdit || pending}
            className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Salvează modificările
          </button>
        </div>
      </div>
    </div>
  );
}
