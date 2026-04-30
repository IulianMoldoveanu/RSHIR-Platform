'use client';

import { useState } from 'react';
import { t, type Locale } from '@/lib/i18n';

export function NotifyWhenLiveForm({
  tenantSlug,
  locale,
}: {
  tenantSlug: string;
  locale: Locale;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch('/api/storefront/notify-when-live', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), tenant_slug: tenantSlug }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <p className="text-sm font-medium text-emerald-700">
        {t(locale, 'storefront.empty_menu_notify_done')}
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex w-full max-w-xs flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="notify-email">
        {t(locale, 'storefront.empty_menu_notify_label')}
      </label>
      <input
        id="notify-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t(locale, 'storefront.empty_menu_notify_placeholder')}
        required
        maxLength={254}
        className="h-10 flex-1 rounded-full border border-purple-200 bg-white px-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
      />
      <button
        type="submit"
        disabled={status === 'sending' || !email.trim()}
        className="inline-flex h-10 items-center justify-center rounded-full bg-purple-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800 disabled:opacity-60"
      >
        {status === 'sending'
          ? t(locale, 'storefront.empty_menu_notify_sending')
          : t(locale, 'storefront.empty_menu_notify_cta')}
      </button>
    </form>
  );
}
