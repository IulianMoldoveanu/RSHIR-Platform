'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/realtime/supabase-browser';
import { t, type Locale } from '@/lib/i18n';

export function AccountLogoutButton({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function handleLogout() {
    setWorking(true);
    try {
      await getBrowserSupabase().auth.signOut();
      // Clear the recognition cookie server-side too — it's httpOnly, so
      // the client can't delete it directly, and it must not keep pointing
      // at the customer row after the Supabase session ends.
      await fetch('/api/account/logout', { method: 'POST' }).catch(() => {});
      router.push('/');
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={working}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-rose-600 disabled:opacity-50"
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      {t(locale, 'account.logout')}
    </button>
  );
}
