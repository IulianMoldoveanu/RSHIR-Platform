'use client';

import { useState } from 'react';

// Minimal 3-field form (email + restaurantName + city) for the /demo
// landing page. Posts to the existing /api/migrate-leads endpoint with
// kind='restaurant' — same row shape as the GloriaFood migration form,
// so leads land in the same `migrate_leads` table and admin reviews
// them through the same surface.
//
// Conversion-best-practice notes:
//   - 3 fields max (more drops conversion ~10-15% per extra field)
//   - Phone is captured via the WhatsApp deep link CTA above the form
//   - On success, show inline confirmation; do NOT redirect away
//   - Rate-limited at the API: 5 requests / min / IP

type Status = 'idle' | 'submitting' | 'success' | 'error' | 'rate_limited';

export function DemoLeadForm() {
  const [email, setEmail] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    try {
      const res = await fetch('/api/migrate-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'restaurant',
          email,
          restaurantName,
          city,
          ref: 'demo-landing',
        }),
      });
      if (res.status === 429) {
        setStatus('rate_limited');
        return;
      }
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-6 text-center text-sm font-medium text-emerald-800">
        Mulțumim! Te sunăm noi în cel mai scurt timp.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2">
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20"
        aria-label="Email"
      />
      <input
        type="text"
        required
        placeholder="Nume restaurant"
        value={restaurantName}
        onChange={(e) => setRestaurantName(e.target.value)}
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20"
        aria-label="Nume restaurant"
      />
      <input
        type="text"
        required
        placeholder="Oraș"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 sm:w-32"
        aria-label="Oraș"
      />
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-full bg-violet-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-800 disabled:opacity-60"
      >
        {status === 'submitting' ? 'Se trimite...' : 'Programează demo'}
      </button>
      {(status === 'error' || status === 'rate_limited') && (
        <p className="basis-full text-xs text-red-600">
          {status === 'rate_limited'
            ? 'Prea multe încercări. Încearcă peste un minut.'
            : 'Ceva nu a mers. Sună-ne direct: 0743 700 916.'}
        </p>
      )}
    </form>
  );
}
