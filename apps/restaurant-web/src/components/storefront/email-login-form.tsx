'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';

// Alternative to PhoneLoginForm on /account — email + magic link instead of
// phone + OTP. Reuses the pre-existing /api/account/magic-link/request
// endpoint (never removed, just not surfaced in the UI while phone+OTP was
// the only option). Always shows the same "check your email" message
// regardless of whether the email matched a customer — the route itself
// never confirms/denies a match (privacy-by-design, same as password reset
// flows), so the client can't distinguish success from a silent no-op.
export function EmailLoginForm({ locale }: { locale: Locale }) {
  const [email, setEmail] = useState('');
  const [working, setWorking] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t(locale, 'account.email_login_err_invalid'));
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/account/magic-link/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === 'rate_limited'
            ? t(locale, 'account.email_login_err_rate_limited')
            : t(locale, 'account.email_login_err_generic'),
        );
        return;
      }
      setSent(true);
    } finally {
      setWorking(false);
    }
  }

  if (sent) {
    return (
      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <Mail className="h-4 w-4" aria-hidden />
          {t(locale, 'account.email_login_sent_title')}
        </div>
        <p className="text-xs text-emerald-800">{t(locale, 'account.email_login_sent_body')}</p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Mail className="h-4 w-4" aria-hidden />
        {t(locale, 'account.email_login_title')}
      </div>
      <p className="mb-3 text-xs text-zinc-600">{t(locale, 'account.email_login_body')}</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nume@exemplu.ro"
          className="h-10 flex-1 rounded-lg border border-zinc-300 px-3 text-sm outline-none"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={working || email.length === 0}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {t(locale, 'account.email_login_send')}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
