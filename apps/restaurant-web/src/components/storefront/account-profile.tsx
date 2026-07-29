'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { User } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';

export function AccountProfile({
  locale,
  firstName,
  lastName,
  phone,
}: {
  locale: Locale;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}) {
  const router = useRouter();
  const [first, setFirst] = useState(firstName ?? '');
  const [last, setLast] = useState(lastName ?? '');
  const [phoneVal, setPhoneVal] = useState(phone ?? '');
  const [working, setWorking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ firstName: first, lastName: last, phone: phoneVal }),
      });
      if (!res.ok) {
        setError(t(locale, 'account.auth_err_generic'));
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <User className="h-4 w-4" aria-hidden />
        {t(locale, 'account.profile_title')}
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <input
            type="text"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            placeholder={t(locale, 'account.auth_full_name_label')}
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
          />
          <input
            type="text"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
          />
        </div>
        <input
          type="tel"
          value={phoneVal}
          onChange={(e) => setPhoneVal(e.target.value)}
          placeholder="+40 7xx xxx xxx"
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={working}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {t(locale, 'account.profile_save')}
          </button>
          {saved && <span className="text-xs text-emerald-700">{t(locale, 'account.profile_saved')}</span>}
        </div>
      </form>
    </section>
  );
}
