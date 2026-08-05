'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';

// Shown on /account only when there's no recognition cookie yet (cleared
// cookies, new device, incognito). Reuses the SAME OTP infrastructure the
// checkout phone-verification step already uses (/api/checkout/otp/request)
// — the only new piece is /api/account/phone-login/verify, which resolves
// the phone to an existing customer row and sets the recognition cookie.
// A phone that never ordered here has nothing to log into (404) — this is
// login for a RETURNING customer, not account creation.
export function PhoneLoginForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestCode() {
    if (phone.length !== 9) {
      setError(t(locale, 'account.login_err_invalid_phone'));
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: `+40${phone}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === 'rate_limited_phone' || data.error === 'rate_limited'
            ? t(locale, 'account.login_err_rate_limited')
            : t(locale, 'account.login_err_generic'),
        );
        return;
      }
      setStep('code');
    } finally {
      setWorking(false);
    }
  }

  async function handleVerifyCode() {
    if (code.length !== 6) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/account/phone-login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: `+40${phone}`, code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === 'no_account_for_phone'
            ? t(locale, 'account.login_err_no_account')
            : data.error === 'invalid_code'
              ? t(locale, 'account.login_err_invalid_code')
              : t(locale, 'account.login_err_generic'),
        );
        return;
      }
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Phone className="h-4 w-4" aria-hidden />
        {t(locale, 'account.login_title')}
      </div>
      <p className="mb-3 text-xs text-zinc-600">{t(locale, 'account.login_body')}</p>

      {step === 'phone' ? (
        <div className="flex gap-2">
          <div className="flex h-10 flex-1 items-center rounded-lg border border-zinc-300 px-3 text-sm">
            <span className="mr-1 text-zinc-500">+40</span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={9}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="7xxxxxxxx"
              className="w-full outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleRequestCode}
            disabled={working || phone.length !== 9}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {t(locale, 'account.login_send_code')}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="h-10 flex-1 rounded-lg border border-zinc-300 px-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={handleVerifyCode}
            disabled={working || code.length !== 6}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {t(locale, 'account.login_verify')}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
