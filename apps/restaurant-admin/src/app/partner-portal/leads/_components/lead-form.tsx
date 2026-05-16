'use client';

import { useActionState } from 'react';
import { registerLead, type RegisterLeadResult } from '../actions';

const initialState: RegisterLeadResult | null = null;

export function LeadForm() {
  const [result, formAction, isPending] = useActionState<
    RegisterLeadResult | null,
    FormData
  >(registerLead, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {result && !result.ok && (
        <div
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {result.error}
        </div>
      )}
      {result?.ok && (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          Lead înregistrat cu succes. Ai 30 de zile exclusivitate pe acest restaurant.
        </div>
      )}

      <div>
        <label
          htmlFor="restaurant_name"
          className="mb-1 block text-xs font-medium text-zinc-700"
        >
          Nume restaurant <span aria-hidden className="text-rose-500">*</span>
        </label>
        <input
          id="restaurant_name"
          name="restaurant_name"
          type="text"
          required
          placeholder="ex: Pizzeria Alfa"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label
            htmlFor="phone"
            className="mb-1 block text-xs font-medium text-zinc-700"
          >
            Telefon
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="07xx xxx xxx"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
          />
        </div>
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-xs font-medium text-zinc-700"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="patron@restaurant.ro"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
          />
        </div>
        <div>
          <label
            htmlFor="cui"
            className="mb-1 block text-xs font-medium text-zinc-700"
          >
            CUI
          </label>
          <input
            id="cui"
            name="cui"
            type="text"
            placeholder="RO12345678"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
          />
        </div>
      </div>
      <p className="text-xs text-zinc-400">
        Completează cel puțin un câmp de contact: telefon, email sau CUI.
      </p>

      <div>
        <label
          htmlFor="expected_close_at"
          className="mb-1 block text-xs font-medium text-zinc-700"
        >
          Data estimată de semnare
        </label>
        <input
          id="expected_close_at"
          name="expected_close_at"
          type="date"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
        />
      </div>

      <div>
        <label
          htmlFor="pitch_notes"
          className="mb-1 block text-xs font-medium text-zinc-700"
        >
          Note pitch (opțional)
        </label>
        <textarea
          id="pitch_notes"
          name="pitch_notes"
          rows={3}
          placeholder="Detalii despre discuție, obiecții, context..."
          className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {isPending ? 'Se înregistrează...' : 'Înregistrează lead'}
        </button>
      </div>
    </form>
  );
}
