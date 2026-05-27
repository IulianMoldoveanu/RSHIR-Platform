'use client';

import { useState } from 'react';
import type { WizardForm } from './wizard';

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
      {error ? (
        <span className="text-xs text-rose-600" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-zinc-500">{hint}</span>
      ) : null}
    </div>
  );
}

type Props = {
  form: WizardForm;
  onChange: (patch: Partial<WizardForm>) => void;
  onNext: () => void;
  onBack: () => void;
};

export function StepAuth({ form, onChange, onNext, onBack }: Props) {
  const [triedNext, setTriedNext] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const errors = {
    email:
      triedNext && !emailValid
        ? 'Adresă de email invalidă.'
        : null,
  };

  function handleNext() {
    setTriedNext(true);
    if (!emailValid) return;
    onNext();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Email setup card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold text-zinc-900">Contul proprietarului</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Cu acest email, patronul se va conecta la panoul de administrare.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          <Field
            label="Email proprietar"
            htmlFor="ownerEmail"
            required
            error={errors.email}
          >
            <input
              id="ownerEmail"
              type="email"
              value={form.email}
              onChange={(e) => onChange({ email: e.target.value })}
              autoComplete="off"
              placeholder="patron@restaurant.ro"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Field>

          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-sm font-medium text-indigo-800">Cum funcționează?</p>
            <p className="mt-1 text-sm text-indigo-700">
              Creăm contul pe loc — emailul este confirmat automat (Iulian
              este prezent în persoană). Patronul va primi o parolă temporară pe
              care o schimbă la prima conectare.
            </p>
          </div>
        </div>
      </div>

      {/* Telegram Hepi card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5 text-sky-600"
              aria-hidden="true"
            >
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-zinc-900">
              Conectează botul Hepi acum{' '}
              <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Recomandat
              </span>
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              Hepi este asistentul AI al restaurantului. Îl poți conecta
              acum în mai puțin de 1 minut — patronul primește notificări
              comenzi noi direct pe telefon.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/dashboard/settings/hepy"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z" />
                </svg>
                Configurează Hepi
              </a>
              <span className="inline-flex items-center text-xs text-zinc-400">
                sau continuă — îl setezi oricând din Configurare
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
          Înapoi
        </button>

        <button
          type="button"
          onClick={handleNext}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Continuă
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
