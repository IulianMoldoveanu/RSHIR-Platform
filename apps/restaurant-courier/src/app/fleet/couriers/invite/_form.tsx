'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bike, Car, Check, Loader2, Truck } from 'lucide-react';
import { inviteCourierToFleetAction } from '../../actions';

export function InviteCourierForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string } | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setDone(null);
    const email = (formData.get('email') as string | null) ?? '';
    start(async () => {
      const r = await inviteCourierToFleetAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone({ email });
      // Refresh /fleet/couriers in the background so the roster picks up
      // the new row when the manager navigates back.
      router.refresh();
    });
  }

  if (done) {
    return (
      <section className="rounded-2xl border border-emerald-700/40 bg-emerald-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
            <Check className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-200">
              Invitație trimisă către {done.email}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Curierul apare deja în flotă cu status Inactiv. Va deveni Activ
              când pornește prima tură.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setDone(null)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
              >
                Invită alt curier
              </button>
              <Link
                href="/fleet/couriers"
                className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400"
              >
                Vezi roster
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <Field label="Email" hint="Curierul folosește acest email la conectare.">
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          placeholder="curier@exemplu.ro"
        />
      </Field>

      <Field label="Nume complet">
        <input
          name="full_name"
          required
          maxLength={120}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          placeholder="Maria Ionescu"
        />
      </Field>

      <Field label="Telefon (opțional)" hint="Format E.164. Apare ca tap-to-call pe roster.">
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          pattern="\+\d{8,15}"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
          placeholder="+40732128199"
        />
      </Field>

      <Field label="Vehicul">
        <div className="grid grid-cols-3 gap-2">
          <VehicleOption
            value="BIKE"
            icon={<Bike className="h-5 w-5" aria-hidden />}
            label="Bicicletă"
            defaultChecked
          />
          <VehicleOption
            value="SCOOTER"
            icon={<Truck className="h-5 w-5" aria-hidden />}
            label="Scuter"
          />
          <VehicleOption
            value="CAR"
            icon={<Car className="h-5 w-5" aria-hidden />}
            label="Mașină"
          />
        </div>
      </Field>

      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {pending ? 'Se trimite invitația…' : 'Trimite invitația'}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function VehicleOption({
  value,
  icon,
  label,
  defaultChecked = false,
}: {
  value: 'BIKE' | 'SCOOTER' | 'CAR';
  icon: React.ReactNode;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-3 text-xs font-medium text-zinc-300 transition has-[:checked]:border-violet-500 has-[:checked]:bg-violet-500/10 has-[:checked]:text-violet-200 hover:border-zinc-700">
      <input
        type="radio"
        name="vehicle_type"
        value={value}
        defaultChecked={defaultChecked}
        className="sr-only"
      />
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </label>
  );
}
