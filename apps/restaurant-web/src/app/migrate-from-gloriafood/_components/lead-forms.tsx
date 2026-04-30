'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { t } from '@/lib/i18n';

type FormKind = 'restaurant' | 'reseller';

type LeadFormsProps = {
  locale: Locale;
  defaultKind?: FormKind;
  ref?: string;
};

type FieldProps = {
  id: string;
  label: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
};

function Field({ id, label, placeholder, type = 'text', required, value, onChange }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20"
      />
    </div>
  );
}

function RestaurantForm({ locale, refCode }: { locale: Locale; refCode: string }) {
  const [email, setEmail] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [city, setCity] = useState('');
  const [gloriaFoodUrl, setGloriaFoodUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error' | 'rate_limited'>('idle');

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
          gloriaFoodUrl: gloriaFoodUrl || undefined,
          ref: refCode || undefined,
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
        {t(locale, 'marketing.migrate.form_success')}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        id="rest-email"
        label={t(locale, 'marketing.migrate.form_email')}
        type="email"
        required
        placeholder={t(locale, 'marketing.migrate.form_email_placeholder')}
        value={email}
        onChange={setEmail}
      />
      <Field
        id="rest-name"
        label={t(locale, 'marketing.migrate.form_restaurant_name')}
        required
        placeholder={t(locale, 'marketing.migrate.form_restaurant_name_placeholder')}
        value={restaurantName}
        onChange={setRestaurantName}
      />
      <Field
        id="rest-city"
        label={t(locale, 'marketing.migrate.form_city')}
        required
        placeholder={t(locale, 'marketing.migrate.form_city_placeholder')}
        value={city}
        onChange={setCity}
      />
      <Field
        id="rest-gf-url"
        label={t(locale, 'marketing.migrate.form_gloriafood_url')}
        type="url"
        placeholder={t(locale, 'marketing.migrate.form_gloriafood_url_placeholder')}
        value={gloriaFoodUrl}
        onChange={setGloriaFoodUrl}
      />
      {(status === 'error' || status === 'rate_limited') && (
        <p className="text-xs text-red-600">
          {status === 'rate_limited'
            ? t(locale, 'marketing.migrate.form_error_rate_limited')
            : t(locale, 'marketing.migrate.form_error_generic')}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-full bg-violet-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-800 disabled:opacity-60"
      >
        {status === 'submitting'
          ? t(locale, 'marketing.migrate.form_submitting')
          : t(locale, 'marketing.migrate.form_submit_restaurant')}
      </button>
    </form>
  );
}

function ResellerForm({ locale, refCode }: { locale: Locale; refCode: string }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [portfolioSize, setPortfolioSize] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error' | 'rate_limited'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    try {
      const res = await fetch('/api/migrate-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'reseller',
          email,
          name,
          country,
          portfolioSize: Number(portfolioSize) || 0,
          ref: refCode || undefined,
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
        {t(locale, 'marketing.migrate.form_success')}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        id="res-email"
        label={t(locale, 'marketing.migrate.form_email')}
        type="email"
        required
        placeholder={t(locale, 'marketing.migrate.form_email_placeholder')}
        value={email}
        onChange={setEmail}
      />
      <Field
        id="res-name"
        label={t(locale, 'marketing.migrate.form_reseller_name')}
        required
        placeholder={t(locale, 'marketing.migrate.form_reseller_name_placeholder')}
        value={name}
        onChange={setName}
      />
      <Field
        id="res-country"
        label={t(locale, 'marketing.migrate.form_country')}
        required
        placeholder={t(locale, 'marketing.migrate.form_country_placeholder')}
        value={country}
        onChange={setCountry}
      />
      <Field
        id="res-portfolio"
        label={t(locale, 'marketing.migrate.form_portfolio_size')}
        type="number"
        required
        placeholder={t(locale, 'marketing.migrate.form_portfolio_size_placeholder')}
        value={portfolioSize}
        onChange={setPortfolioSize}
      />
      {(status === 'error' || status === 'rate_limited') && (
        <p className="text-xs text-red-600">
          {status === 'rate_limited'
            ? t(locale, 'marketing.migrate.form_error_rate_limited')
            : t(locale, 'marketing.migrate.form_error_generic')}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        {status === 'submitting'
          ? t(locale, 'marketing.migrate.form_submitting')
          : t(locale, 'marketing.migrate.form_submit_reseller')}
      </button>
    </form>
  );
}

export function LeadForms({ locale, defaultKind = 'restaurant', ref: refCode = '' }: LeadFormsProps) {
  const [activeForm, setActiveForm] = useState<FormKind>(defaultKind);

  return (
    <div id="forms" className="flex flex-col gap-6">
      {/* Tab switcher */}
      <div className="flex rounded-full border border-zinc-200 bg-zinc-100 p-1">
        <button
          type="button"
          onClick={() => setActiveForm('restaurant')}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
            activeForm === 'restaurant'
              ? 'bg-white text-violet-700 shadow-sm'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          {t(locale, 'marketing.migrate.form_restaurant_title')}
        </button>
        <button
          type="button"
          onClick={() => setActiveForm('reseller')}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
            activeForm === 'reseller'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          {t(locale, 'marketing.migrate.form_reseller_title')}
        </button>
      </div>

      {activeForm === 'restaurant' ? (
        <RestaurantForm locale={locale} refCode={refCode} />
      ) : (
        <ResellerForm locale={locale} refCode={refCode} />
      )}
    </div>
  );
}
