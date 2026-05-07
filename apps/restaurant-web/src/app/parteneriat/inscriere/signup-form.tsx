'use client';

import { useState } from 'react';

const AUDIENCE_TYPES = [
  { v: 'CREATOR', l: 'Creator / influencer' },
  { v: 'BLOGGER', l: 'Blogger food / restaurant reviewer' },
  { v: 'CONSULTANT', l: 'Consultant restaurant / agenție' },
  { v: 'EXISTING_TENANT', l: 'Sunt deja restaurant HIR' },
  { v: 'OTHER', l: 'Altceva' },
];

const CHANNELS = [
  { v: 'instagram', l: 'Instagram' },
  { v: 'tiktok', l: 'TikTok' },
  { v: 'facebook', l: 'Facebook' },
  { v: 'youtube', l: 'YouTube' },
  { v: 'whatsapp', l: 'WhatsApp' },
  { v: 'blog', l: 'Blog / site' },
  { v: 'newsletter', l: 'Newsletter' },
  { v: 'other', l: 'Alt canal' },
];

type Done = { partner_id: string; code: string; email: string };

export function SignupForm({ adminUrl }: { adminUrl: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const channels = CHANNELS.filter((c) => fd.get(`channel_${c.v}`) === 'on').map((c) => c.v);

    const password = String(fd.get('password') ?? '');
    const passwordConfirm = String(fd.get('password_confirm') ?? '');
    if (password !== passwordConfirm) {
      setError('Parolele nu coincid.');
      setSubmitting(false);
      return;
    }
    if (password.length < 10) {
      setError('Parola trebuie să aibă cel puțin 10 caractere.');
      setSubmitting(false);
      return;
    }

    const submittedEmail = String(fd.get('email') ?? '').trim();
    const body = {
      full_name: String(fd.get('full_name') ?? '').trim(),
      email: submittedEmail,
      password,
      phone: String(fd.get('phone') ?? '').trim() || null,
      audience_type: String(fd.get('audience_type') ?? 'OTHER'),
      audience_size: Number(fd.get('audience_size') ?? '') || null,
      channels,
      pitch: String(fd.get('pitch') ?? '').trim(),
      // PR3: optional self-declared fleet-manager flag + free-text network
      // description. Both columns exist on affiliate_applications since PR1
      // (also_fleet_manager bool, network_description text). UI is opt-in;
      // partner-portal IS partner-facing so the word "flotă" is allowed here.
      also_fleet_manager: fd.get('also_fleet_manager') === 'on',
      network_description: String(fd.get('network_description') ?? '').trim() || null,
      honeypot: String(fd.get('website') ?? ''),
    };

    try {
      const r = await fetch('/api/parteneriat/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const j = (await r.json()) as { partner_id: string; code: string };
        setDone({ ...j, email: submittedEmail });
      } else {
        const j = await r.json().catch(() => null);
        setError(j?.detail ?? j?.error ?? `Eroare ${r.status}`);
      }
    } catch {
      setError('Eroare de rețea. Încearcă din nou.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-[#A7F3D0] bg-[#ECFDF5] p-5">
          <div className="text-sm font-semibold text-[#047857]">Cont creat ✓</div>
          <p className="mt-2 text-sm text-[#047857]">
            Codul tău de partener:{' '}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[#0F172A]">
              {done.code}
            </code>
          </p>
          <p className="mt-2 text-sm text-[#047857]">
            Te poți loga imediat în portalul de partener pentru a vedea linkul tău și a
            începe să-l distribui. Cererea de aprobare e deja trimisă echipei HIR (24h SLA).
          </p>
        </div>
        <a
          href={`${adminUrl}/login?email=${encodeURIComponent(done.email)}&signedUp=1`}
          className="inline-flex w-full items-center justify-center rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA]"
        >
          Mergi la login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Honeypot — hidden field bots fill, humans don't */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website (lasă gol):
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label="Nume complet" required>
        <input
          name="full_name"
          required
          minLength={3}
          maxLength={120}
          autoComplete="name"
          className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
        />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Email" required>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
          />
        </Field>
        <Field label="Telefon">
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
          />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Parolă (min. 10 caractere)" required>
          <input
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={72}
            autoComplete="new-password"
            className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
          />
        </Field>
        <Field label="Confirmă parola" required>
          <input
            name="password_confirm"
            type="password"
            required
            minLength={10}
            maxLength={72}
            autoComplete="new-password"
            className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
          />
        </Field>
      </div>

      <Field label="Profilul tău" required>
        <select
          name="audience_type"
          required
          className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
        >
          {AUDIENCE_TYPES.map((a) => (
            <option key={a.v} value={a.v}>
              {a.l}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Mărimea audienței (followers / vizitatori lunari)">
        <input
          name="audience_size"
          type="number"
          min={0}
          className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
        />
      </Field>

      <Field label="Canale unde plănuiești să recomanzi">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {CHANNELS.map((c) => (
            <label
              key={c.v}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] hover:border-[#C7D2FE]"
            >
              <input type="checkbox" name={`channel_${c.v}`} className="accent-[#4F46E5]" />
              {c.l}
            </label>
          ))}
        </div>
      </Field>

      <Field label="De ce vrei să fii partener HIR?" required>
        <textarea
          name="pitch"
          required
          minLength={20}
          maxLength={1000}
          rows={4}
          placeholder="Spune-ne unde vei recomanda HIR: TikTok / Instagram / blog / clienți restaurant existenți / lista ta de manageri flotă. Cu cât e mai concret, cu atât aprobăm mai repede."
          className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
        />
      </Field>

      {/* PR3: optional fleet self-declaration + network description.
          Partner-portal is partner-facing — word "flotă" is allowed here. */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] hover:border-[#C7D2FE]">
        <input
          type="checkbox"
          name="also_fleet_manager"
          className="mt-0.5 accent-[#4F46E5]"
        />
        <span>
          <span className="block font-medium">Operați și o flotă de curieri?</span>
          <span className="mt-0.5 block text-xs text-[#475569]">
            Bifați dacă, pe lângă recomandarea HIR, gestionați și curieri proprii. Dublează
            valoarea propunerii (software + capacitate de livrare).
          </span>
        </span>
      </label>

      <Field label="Spuneți-ne despre rețeaua dumneavoastră">
        <textarea
          name="network_description"
          maxLength={500}
          rows={3}
          placeholder="Ex: 12 restaurante GloriaFood pe care le ghidez pe Telegram + 4 SRL-uri flotă în Brașov și Cluj. Opțional, max. 500 caractere."
          className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
        />
      </Field>

      {error ? (
        <div className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center rounded-md bg-[#4F46E5] px-5 py-3 text-sm font-medium text-white ring-1 ring-inset ring-[#4338CA] hover:bg-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:ring-offset-2 disabled:opacity-60"
      >
        {submitting ? 'Se creează contul…' : 'Creează cont și primește linkul meu'}
      </button>

      <p className="text-xs text-[#94a3b8]">
        Prin trimitere accepți politica HIR de utilizare a datelor. Te contactăm doar pe email.
      </p>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[#475569]">
        {label}
        {required ? <span className="ml-0.5 text-[#B91C1C]">*</span> : null}
      </span>
      {children}
    </label>
  );
}
