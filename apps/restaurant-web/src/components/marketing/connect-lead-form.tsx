'use client';

import { useState } from 'react';
import { Send, CheckCircle2, AlertTriangle } from 'lucide-react';

type FormState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'success' }
  | { phase: 'error'; message: string };

export function ConnectLeadForm() {
  const [restaurantName, setRestaurantName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [estimatedOrders, setEstimatedOrders] = useState('');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState<FormState>({ phase: 'idle' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ phase: 'submitting' });

    const payload: Record<string, unknown> = {
      restaurantName: restaurantName.trim(),
      contactEmail: contactEmail.trim().toLowerCase(),
      websiteUrl: websiteUrl.trim(),
    };
    if (contactPhone.trim()) payload.contactPhone = contactPhone.trim();
    if (notes.trim()) payload.notes = notes.trim();
    const ord = Number.parseInt(estimatedOrders, 10);
    if (!Number.isNaN(ord) && ord >= 0) payload.estimatedOrdersPerDay = ord;

    try {
      const res = await fetch('/api/connect/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data?.error === 'rate_limited'
            ? 'Prea multe cereri. Încearcă peste o oră.'
            : data?.error === 'invalid_body'
              ? 'Date incomplete sau invalide. Verifică câmpurile.'
              : data?.error === 'forbidden_origin'
                ? 'Origine respinsă. Reîncarcă pagina și încearcă din nou.'
                : 'Eroare de server. Încearcă din nou sau scrie-ne la connect@hirforyou.ro.';
        setState({ phase: 'error', message: msg });
        return;
      }
      setState({ phase: 'success' });
    } catch {
      setState({
        phase: 'error',
        message: 'Conexiune întreruptă. Verifică internetul și reîncearcă.',
      });
    }
  };

  if (state.phase === 'success') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <h3 className="mt-3 text-lg font-semibold text-emerald-900">
          Mulțumim! Cererea ta a ajuns la noi.
        </h3>
        <p className="mt-2 text-sm text-emerald-800">
          Te contactăm în maxim 24 de ore cu documentația API, credențiale de
          test și pașii de integrare. Dacă e urgent, scrie-ne pe{' '}
          <a
            href="mailto:connect@hirforyou.ro"
            className="font-medium underline hover:text-emerald-900"
          >
            connect@hirforyou.ro
          </a>
          .
        </p>
      </div>
    );
  }

  const submitting = state.phase === 'submitting';

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nume restaurant *"
          name="restaurant_name"
          value={restaurantName}
          onChange={setRestaurantName}
          required
          minLength={2}
          maxLength={200}
          placeholder="ex: Delivery House"
          disabled={submitting}
        />
        <Field
          label="URL site comenzi *"
          name="website_url"
          type="url"
          value={websiteUrl}
          onChange={setWebsiteUrl}
          required
          placeholder="https://exemplu.ro"
          disabled={submitting}
          inputMode="url"
        />
        <Field
          label="Email contact *"
          name="contact_email"
          type="email"
          value={contactEmail}
          onChange={setContactEmail}
          required
          maxLength={254}
          placeholder="patron@exemplu.ro"
          disabled={submitting}
          inputMode="email"
        />
        <Field
          label="Telefon (opțional)"
          name="contact_phone"
          type="tel"
          value={contactPhone}
          onChange={setContactPhone}
          maxLength={32}
          placeholder="+40…"
          disabled={submitting}
          inputMode="tel"
        />
        <Field
          label="Volum estimat (comenzi/zi)"
          name="estimated_orders"
          type="number"
          value={estimatedOrders}
          onChange={setEstimatedOrders}
          placeholder="ex: 100"
          disabled={submitting}
          inputMode="numeric"
          min={0}
          max={10000}
        />
        <div className="sm:col-span-2">
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">
              Câteva detalii (opțional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
              disabled={submitting}
              placeholder="Pe ce platformă rulează site-ul, ce zone livrezi, când vrei să începem…"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-50"
            />
          </label>
        </div>
      </div>

      {state.phase === 'error' && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>{state.message}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Trimiterea înseamnă că accepți să te contactăm pe canalele de mai sus.
          Nu transmitem datele tale către terți.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Trimitere…' : 'Trimite cererea'}
          {!submitting && <Send className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  required,
  minLength,
  maxLength,
  placeholder,
  disabled,
  inputMode,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric';
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-700">{label}</span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        min={min}
        max={max}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-50"
      />
    </label>
  );
}
