'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, UserPlus } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/realtime/supabase-browser';
import { t, type Locale } from '@/lib/i18n';

type Tab = 'login' | 'signup';

// Real account login/signup (email+password today, Google now, Facebook/
// Apple as they're wired up) — replaces the old assumption that "account"
// only means recognizing a returning customer by phone/email. A visitor
// can create an account here even before ever placing an order.
//
// "Keep me logged in" mirrors the pattern already proven in
// restaurant-admin's /login: Supabase refresh tokens have no built-in
// expiry, so checked = session persists indefinitely; unchecked = wiped on
// tab close via beforeunload.
export function AccountAuthForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupSent, setSignupSent] = useState(false);

  async function syncCustomerRow() {
    // Bridges the new auth session to the pre-existing customer-recognition
    // cookie (loyalty/repeat-order/order-history read that cookie, not the
    // Supabase session directly) and creates the tenant-scoped customers
    // row on first login. Best-effort refresh — router.refresh() re-renders
    // the server component either way once the cookie is set.
    try {
      await fetch('/api/account/ensure-customer', { method: 'POST' });
    } catch {
      // Non-fatal — /account re-attempts on next load.
    }
  }

  function applyKeepLoggedInPreference(supabase: ReturnType<typeof getBrowserSupabase>) {
    if (typeof window === 'undefined') return;
    try {
      if (keepLoggedIn) {
        window.localStorage.setItem('hir-keep-logged-in', '1');
      } else {
        window.localStorage.removeItem('hir-keep-logged-in');
        window.addEventListener(
          'beforeunload',
          () => {
            supabase.auth.signOut().catch(() => {});
          },
          { once: true },
        );
      }
    } catch {
      // localStorage may be blocked in private mode — skip silently
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t(locale, 'account.auth_err_invalid_email'));
      return;
    }
    setError(null);
    setWorking(true);
    try {
      const supabase = getBrowserSupabase();
      applyKeepLoggedInPreference(supabase);
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        setError(t(locale, 'account.auth_err_invalid_credentials'));
        return;
      }
      await syncCustomerRow();
      router.refresh();
    } catch {
      setError(t(locale, 'account.auth_err_generic'));
    } finally {
      setWorking(false);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t(locale, 'account.auth_err_invalid_email'));
      return;
    }
    if (!fullName.trim()) {
      setError(t(locale, 'account.auth_err_name_required'));
      return;
    }
    if (password.length < 8) {
      setError(t(locale, 'account.auth_err_password_too_short'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t(locale, 'account.auth_err_password_mismatch'));
      return;
    }
    setError(null);
    setWorking(true);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (signUpErr) {
        setError(
          /already registered|already exists/i.test(signUpErr.message)
            ? t(locale, 'account.auth_err_email_taken')
            : t(locale, 'account.auth_err_generic'),
        );
        return;
      }
      // Email confirmation is required (Supabase project default) — no
      // active session yet until the visitor clicks the confirmation link.
      if (!data.session) {
        setSignupSent(true);
        return;
      }
      applyKeepLoggedInPreference(supabase);
      await syncCustomerRow();
      router.refresh();
    } catch {
      setError(t(locale, 'account.auth_err_generic'));
    } finally {
      setWorking(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setWorking(true);
    try {
      const supabase = getBrowserSupabase();
      const redirectTo = `${window.location.origin}/auth/callback?next=/account`;
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (oauthErr) {
        setError(t(locale, 'account.auth_err_generic'));
        setWorking(false);
      }
      // On success the browser navigates away to Google — no further
      // client state to update here.
    } catch {
      setError(t(locale, 'account.auth_err_generic'));
      setWorking(false);
    }
  }

  if (signupSent) {
    return (
      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">{t(locale, 'account.auth_signup_check_email')}</p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex gap-4 border-b border-zinc-100">
        <button
          type="button"
          onClick={() => {
            setTab('login');
            setError(null);
          }}
          className={`flex items-center gap-1.5 pb-2 text-sm font-semibold transition-colors ${
            tab === 'login' ? 'border-b-2 border-[var(--hir-brand)] text-zinc-900' : 'text-zinc-400 hover:text-zinc-700'
          }`}
        >
          <LogIn className="h-3.5 w-3.5" aria-hidden />
          {t(locale, 'account.auth_tab_login')}
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('signup');
            setError(null);
          }}
          className={`flex items-center gap-1.5 pb-2 text-sm font-semibold transition-colors ${
            tab === 'signup' ? 'border-b-2 border-[var(--hir-brand)] text-zinc-900' : 'text-zinc-400 hover:text-zinc-700'
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden />
          {t(locale, 'account.auth_tab_signup')}
        </button>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={working}
        className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-50"
      >
        <GoogleIcon />
        {t(locale, 'account.auth_google')}
      </button>

      <div className="mb-3 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        {t(locale, 'account.auth_or')}
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      <form onSubmit={tab === 'login' ? handleLogin : handleSignup} className="flex flex-col gap-2.5">
        {tab === 'signup' && (
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t(locale, 'account.auth_full_name_label')}
            autoComplete="name"
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t(locale, 'account.auth_email_label')}
          autoComplete="email"
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t(locale, 'account.auth_password_label')}
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
        />
        {tab === 'signup' && (
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t(locale, 'account.auth_password_confirm_label')}
            autoComplete="new-password"
            className="h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[var(--hir-brand,#7c3aed)]"
          />
        )}

        {tab === 'login' && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 select-none">
            <input
              type="checkbox"
              checked={keepLoggedIn}
              onChange={(e) => setKeepLoggedIn(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-[var(--hir-brand,#7c3aed)]"
            />
            {t(locale, 'account.auth_keep_logged_in')}
          </label>
        )}

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={working}
          className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-[var(--hir-brand,#7c3aed)] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {tab === 'login' ? t(locale, 'account.auth_login_submit') : t(locale, 'account.auth_signup_submit')}
        </button>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.27a12 12 0 0 0 0 10.76l4-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.11C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}
