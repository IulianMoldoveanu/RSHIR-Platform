'use client';

// Contact form for the marketing /contact page. Posts to the existing
// /api/migrate-leads endpoint (already rate-limited 5/min/IP, same-origin
// gated). Lead kind = 'restaurant' or 'reseller' per the form selector,
// matching the discriminated union the API enforces. Iulian sees the
// lead in the same admin queue as the migrate-from-gloriafood form.
//
// Lane WEB-I18N-EN-PARITY (2026-05-15): accepts locale prop + uses t()
// for all visible strings so RO/EN cookie flips re-render the form copy.

import { useState } from 'react';
import { t, type Locale } from '@/lib/i18n';

export function ContactForm({ locale }: { locale: Locale }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>('restaurant');

  const topics = [
    { v: 'restaurant', l: t(locale, 'contact.form_topic_restaurant') },
    { v: 'reseller', l: t(locale, 'contact.form_topic_reseller') },
    { v: 'other', l: t(locale, 'contact.form_topic_other') },
  ];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const honeypot = String(fd.get('website') ?? '');
    if (honeypot) {
      // Pretend success silently for bots.
      setDone(true);
      setSubmitting(false);
      return;
    }

    const email = String(fd.get('email') ?? '').trim();
    const name = String(fd.get('name') ?? '').trim();
    const message = String(fd.get('message') ?? '').trim();
    const city = String(fd.get('city') ?? '').trim() || 'Necunoscut';
    const phone = String(fd.get('phone') ?? '').trim();

    // Map our topic onto the API's discriminated union (kind).
    // 'other' falls back to 'restaurant' kind so the row lands in the
    // same migrate_leads queue (city/message preserved).
    const apiKind = topic === 'reseller' ? 'reseller' : 'restaurant';

    const body =
      apiKind === 'reseller'
        ? {
            kind: 'reseller' as const,
            email,
            name,
            country: city || 'România',
            // Use 0 portfolioSize as a default; we'll learn real size in followup.
            portfolioSize: 0,
            ref: `contact-form|${topic}|${phone}|${message.slice(0, 500)}`,
          }
        : {
            kind: 'restaurant' as const,
            email,
            restaurantName: name,
            city: city || 'Necunoscut',
            ref: `contact-form|${topic}|${phone}|${message.slice(0, 500)}`,
          };

    try {
      const r = await fetch('/api/migrate-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setDone(true);
      } else {
        const j = await r.json().catch(() => null);
        if (r.status === 429) {
          setError(t(locale, 'contact.form_err_rate_limit'));
        } else {
          setError(j?.error ? `Eroare: ${j.error}` : `Eroare ${r.status}`);
        }
      }
    } catch {
      setError(t(locale, 'contact.form_err_network'));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-[#A7F3D0] bg-[#ECFDF5] p-5">
        <div className="text-sm font-semibold text-[#047857]">
          {t(locale, 'contact.form_success_title')}
        </div>
        <p className="mt-2 text-sm text-[#047857]">
          {t(locale, 'contact.form_success_body')}{' '}
          <a href="mailto:office@hirforyou.ro" className="font-medium underline">
            office@hirforyou.ro
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Honeypot */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website (lasă gol):
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label={t(locale, 'contact.form_topic_label')} required>
        <select
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
        >
          {topics.map((tp) => (
            <option key={tp.v} value={tp.v}>
              {tp.l}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={
            topic === 'reseller'
              ? t(locale, 'contact.form_name_reseller')
              : t(locale, 'contact.form_name_restaurant')
          }
          required
        >
          <input
            name="name"
            required
            minLength={2}
            maxLength={200}
            className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
          />
        </Field>
        <Field label={t(locale, 'contact.form_email')} required>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
          />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label={t(locale, 'contact.form_phone')}>
          <input
            name="phone"
            type="tel"
            maxLength={40}
            placeholder="+40..."
            className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
          />
        </Field>
        <Field
          label={
            topic === 'reseller'
              ? t(locale, 'contact.form_city_reseller')
              : t(locale, 'contact.form_city_restaurant')
          }
        >
          <input
            name="city"
            maxLength={100}
            placeholder={
              topic === 'reseller'
                ? t(locale, 'contact.form_city_placeholder_reseller')
                : t(locale, 'contact.form_city_placeholder_restaurant')
            }
            className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
          />
        </Field>
      </div>

      <Field label={t(locale, 'contact.form_message')} required>
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          placeholder={
            topic === 'reseller'
              ? t(locale, 'contact.form_placeholder_reseller')
              : t(locale, 'contact.form_placeholder_restaurant')
          }
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
        {submitting ? t(locale, 'contact.form_submitting') : t(locale, 'contact.form_submit')}
      </button>

      <p className="text-xs text-[#94A3B8]">{t(locale, 'contact.form_privacy')}</p>
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
