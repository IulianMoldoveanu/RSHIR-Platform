'use client';

// Pairing notes UI — minimal coordination surface between OWNER and
// Fleet Manager, surfaced inside the FM section of /dashboard/settings/team.
//
// Layout:
//   * If current user is OWNER:
//       - For each FM member, show a row with:
//           - FM email + their note + tap-to-call link to FM phone
//           - "Note pentru flotă" textarea (writable)
//   * If current user is FLEET_MANAGER:
//       - Show a single row for the active tenant:
//           - OWNER's note + tap-to-call link to tenant contact_phone
//           - "Note pentru OWNER" textarea (writable)
//           - Optional FM phone field
//
// Internal-only — never displayed to merchants. Strings use formal RO.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setNoteFromOwner,
  setNoteFromFleet,
  type PairingNoteResult,
} from './pairing-note-actions';

export type PairingNoteRow = {
  user_id: string;
  email: string | null;
  note_from_fleet: string | null;
  note_from_owner: string | null;
  note_from_fleet_updated_at: string | null;
  note_from_owner_updated_at: string | null;
  fm_phone: string | null;
};

function formatTs(ts: string | null): string | null {
  if (!ts) return null;
  try {
    return new Intl.DateTimeFormat('ro-RO', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ts));
  } catch {
    return null;
  }
}

function buildTelHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9+]/g, '');
  if (digits.length < 6) return null;
  return `tel:${digits}`;
}

type PairingNoteErrorCode = Extract<PairingNoteResult, { ok: false }>['error'];

function translate(error: PairingNoteErrorCode): string {
  const map: Record<PairingNoteErrorCode, string> = {
    unauthenticated: 'Sesiune expirată — autentificați-vă din nou.',
    forbidden: 'Nu aveți permisiunea să modificați această notă.',
    invalid_input: 'Datele introduse nu sunt valide.',
    member_not_found: 'Membrul nu mai există în acest restaurant.',
    db_error: 'Eroare la salvare. Încercați din nou.',
  };
  return map[error] ?? 'Eroare necunoscută.';
}

// ────────────────────────────────────────────────────────────
// OWNER view
// ────────────────────────────────────────────────────────────

export function PairingNoteOwnerSection({
  tenantId,
  rows,
}: {
  tenantId: string;
  rows: PairingNoteRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">
          Coordonare cu managerii de flotă
        </h2>
        <p className="text-sm text-zinc-600">
          Lăsați-i o notă scurtă fiecărui manager de flotă (instrucțiuni
          de predare, programul de lucru, persoana de contact). Managerul
          o vede la următoarea autentificare.
        </p>
        <p className="text-xs text-zinc-500">
          Mesageria în timp real va fi disponibilă într-o versiune
          următoare; deocamdată folosiți acest panou plus telefonul.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <OwnerNoteCard key={row.user_id} tenantId={tenantId} row={row} />
        ))}
      </div>
    </section>
  );
}

function OwnerNoteCard({
  tenantId,
  row,
}: {
  tenantId: string;
  row: PairingNoteRow;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(row.note_from_owner ?? '');
  const [feedback, setFeedback] = useState<PairingNoteResult | null>(null);

  const dirty = (draft.trim() || null) !== (row.note_from_owner ?? null);
  const fleetTs = formatTs(row.note_from_fleet_updated_at);
  const tel = buildTelHref(row.fm_phone);

  function save() {
    setFeedback(null);
    start(async () => {
      const result = await setNoteFromOwner({
        fmUserId: row.user_id,
        expectedTenantId: tenantId,
        note: draft.trim().length === 0 ? null : draft,
      });
      setFeedback(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-zinc-900">
            {row.email ?? '(email indisponibil)'}
          </span>
          <span className="text-xs text-zinc-500">Manager flotă</span>
        </div>
        {tel ? (
          <a
            href={tel}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
          >
            Sună {row.fm_phone}
          </a>
        ) : (
          <span className="text-xs text-zinc-500">
            Numărul nu a fost completat încă.
          </span>
        )}
      </header>

      <div className="rounded-md border border-zinc-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Notă de la manager
        </p>
        {row.note_from_fleet ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
            {row.note_from_fleet}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">
            Niciun mesaj momentan.
          </p>
        )}
        {fleetTs && (
          <p className="mt-2 text-[11px] text-zinc-400">
            Actualizat: {fleetTs}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={`owner-note-${row.user_id}`}
          className="text-xs font-semibold uppercase tracking-wide text-zinc-600"
        >
          Notă pentru flotă
        </label>
        <textarea
          id={`owner-note-${row.user_id}`}
          rows={3}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          placeholder="Ex.: Vă rugăm intrați prin curtea din spate, ușa cu codul 1234. Persoană de contact: Maria, 0712-345-678."
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-400">
            {draft.length}/2000
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="rounded-md bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {pending ? 'Se salvează…' : 'Salvează nota'}
          </button>
        </div>
        {feedback && <FeedbackBanner result={feedback} />}
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────
// FLEET_MANAGER view
// ────────────────────────────────────────────────────────────

export function PairingNoteFmSection({
  tenantId,
  ownerPhone,
  ownerNote,
  ownerNoteUpdatedAt,
  initialFleetNote,
  initialFmPhone,
}: {
  tenantId: string;
  ownerPhone: string | null;
  ownerNote: string | null;
  ownerNoteUpdatedAt: string | null;
  initialFleetNote: string | null;
  initialFmPhone: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [noteDraft, setNoteDraft] = useState(initialFleetNote ?? '');
  const [phoneDraft, setPhoneDraft] = useState(initialFmPhone ?? '');
  const [feedback, setFeedback] = useState<PairingNoteResult | null>(null);

  const tel = buildTelHref(ownerPhone);
  const ownerTs = formatTs(ownerNoteUpdatedAt);

  const sanitizedNote = noteDraft.trim().length === 0 ? null : noteDraft;
  const noteDirty = sanitizedNote !== (initialFleetNote ?? null);
  const phoneDirty = (phoneDraft.trim() || null) !== (initialFmPhone ?? null);
  const dirty = noteDirty || phoneDirty;

  function save() {
    setFeedback(null);
    start(async () => {
      const result = await setNoteFromFleet({
        expectedTenantId: tenantId,
        note: sanitizedNote,
        phone: phoneDirty ? (phoneDraft.trim() || null) : undefined,
      });
      setFeedback(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900">
          Coordonare cu OWNER-ul restaurantului
        </h2>
        <p className="text-sm text-zinc-600">
          Lăsați o notă pentru OWNER (program, instrucțiuni de predare,
          numărul propriu de telefon). OWNER-ul o vede la următoarea
          autentificare.
        </p>
        <p className="text-xs text-zinc-500">
          Mesageria în timp real va fi disponibilă într-o versiune
          următoare; deocamdată folosiți acest panou plus telefonul.
        </p>
      </header>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Notă de la OWNER
          </p>
          {tel ? (
            <a
              href={tel}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
            >
              Sună {ownerPhone}
            </a>
          ) : (
            <span className="text-xs text-zinc-500">
              Numărul OWNER-ului nu este configurat.
            </span>
          )}
        </div>
        {ownerNote ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
            {ownerNote}
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">
            Niciun mesaj momentan.
          </p>
        )}
        {ownerTs && (
          <p className="mt-2 text-[11px] text-zinc-400">
            Actualizat: {ownerTs}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="fm-note"
          className="text-xs font-semibold uppercase tracking-wide text-zinc-600"
        >
          Notă pentru OWNER
        </label>
        <textarea
          id="fm-note"
          rows={3}
          maxLength={2000}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          placeholder="Ex.: Curiera de tură este Andreea (0723-111-222). Predările se fac la intrarea principală între 11:00 și 23:00."
        />
        <span className="text-[11px] text-zinc-400">
          {noteDraft.length}/2000
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="fm-phone"
          className="text-xs font-semibold uppercase tracking-wide text-zinc-600"
        >
          Telefonul dumneavoastră (opțional)
        </label>
        <input
          id="fm-phone"
          type="tel"
          maxLength={32}
          inputMode="tel"
          value={phoneDraft}
          onChange={(e) => setPhoneDraft(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          placeholder="0712 345 678"
        />
        <p className="text-[11px] text-zinc-500">
          OWNER-ul vede acest număr și îl poate apela cu un singur tap
          când are nevoie de coordonare.
        </p>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="rounded-md bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {pending ? 'Se salvează…' : 'Salvează'}
        </button>
      </div>

      {feedback && <FeedbackBanner result={feedback} />}
    </section>
  );
}

function FeedbackBanner({ result }: { result: PairingNoteResult }) {
  if (result.ok) {
    return <span className="text-xs text-emerald-700">Salvat.</span>;
  }
  return (
    <span className="text-xs text-rose-700">
      {translate(result.error)}
      {result.detail ? ` (${result.detail})` : ''}
    </span>
  );
}
