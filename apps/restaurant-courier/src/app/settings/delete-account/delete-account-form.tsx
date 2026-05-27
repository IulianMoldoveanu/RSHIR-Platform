'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, Trash2 } from 'lucide-react';
import { requestAccountDeletion } from './actions';

export function DeleteAccountForm({ userEmail }: { userEmail: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const CONFIRM_TEXT = 'STERGE CONTUL';
  const canSubmit = confirmed && typed === CONFIRM_TEXT;

  function handleSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await requestAccountDeletion();
      if (result.ok) {
        setDone(true);
      } else {
        setError(result.error ?? 'Eroare necunoscută. Contactează suportul.');
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <p className="mb-2 text-base font-semibold text-emerald-300">Cerere înregistrată</p>
        <p className="text-sm text-[#9090AA]">
          Cererea ta de ștergere a contului a fost înregistrată. Contul va fi dezactivat în 48h
          și datele șterse conform politicii de retenție. Vei primi confirmare pe email la{' '}
          <strong className="text-[#E4E4F0]">{userEmail}</strong>.
        </p>
      </div>
    );
  }

  return (
    <>
      <Link
        href="/dashboard/settings"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[#9090AA] hover:text-[#E4E4F0]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Înapoi la setări
      </Link>

      <header className="mb-6 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-rose-500/30">
          <Trash2 className="h-5 w-5 text-rose-400" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-[#E4E4F0]">Șterge cont</h1>
          <p className="mt-1 text-sm text-[#9090AA]">
            Această acțiune este permanentă și nu poate fi anulată.
          </p>
        </div>
      </header>

      {/* Warning box */}
      <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          <div className="text-sm text-amber-200 space-y-1">
            <p className="font-semibold">Ce se întâmplă când ștergi contul:</p>
            <ul className="list-disc pl-4 space-y-1 text-amber-300/80">
              <li>Profilul tău de curier este dezactivat imediat.</li>
              <li>Nu vei mai putea accepta comenzi.</li>
              <li>Datele tale de activitate sunt șterse conform politicii (5 ani pentru date fiscale).</li>
              <li>Fotografiile dovadă de livrare sunt șterse în 30 de zile.</li>
              <li>Câștigurile neachitate vor fi procesate în ciclul de plată următor.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2C2C3E] bg-[#1C1C2E] p-5 space-y-5">
        {/* Step 1: checkbox */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-5 w-5 flex-shrink-0 cursor-pointer rounded border-[#3C3C5E] bg-[#0F1115] accent-rose-500"
          />
          <span className="text-sm text-[#BBBBD0]">
            Înțeleg că ștergerea contului este permanentă și că voi pierde accesul la toate datele
            asociate contului <strong className="text-[#E4E4F0]">{userEmail}</strong>.
          </span>
        </label>

        {/* Step 2: type confirmation */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[#9090AA]">
            Tastează{' '}
            <code className="rounded bg-[#0F1115] px-1.5 py-0.5 text-rose-400">
              {CONFIRM_TEXT}
            </code>{' '}
            pentru a confirma:
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_TEXT}
            className="w-full rounded-xl border border-[#3C3C5E] bg-[#0F1115] px-4 py-3 text-sm text-[#E4E4F0] placeholder-[#4C4C6E] outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30"
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/15 px-5 text-sm font-semibold text-rose-300 transition-all hover:bg-rose-500/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {isPending ? 'Se procesează...' : 'Șterge contul definitiv'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-[#666680]">
        Ai o problemă? Contactează-ne la{' '}
        <a href="mailto:suport@hirforyou.ro" className="text-violet-400 hover:underline">
          suport@hirforyou.ro
        </a>{' '}
        înainte de a șterge contul.
      </p>
    </>
  );
}
