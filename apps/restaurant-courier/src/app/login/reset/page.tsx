'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import { createBrowserSupabase } from '@hir/supabase-types';
import { Button } from '@hir/ui';

// Password-reset landing for the link emailed by /login/forgot. Supabase
// auth puts the recovery token in the URL fragment (#access_token=...).
// The browser SDK auto-detects this on createBrowserSupabase() and the
// session is upgraded to a recovery session — at which point we can call
// auth.updateUser({ password }) to set the new password.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const router = useRouter();
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    // Detect whether we landed here via a recovery link. The SDK populates
    // a 'PASSWORD_RECOVERY' auth state when the URL fragment has the
    // recovery hash; if not, we show a 'link expired or invalid' UI.
    const supabase = createBrowserSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setHasToken(true);
      }
    });
    // Fall back: if no event fires within 1.5s, assume no recovery hash.
    const timer = setTimeout(() => {
      setHasToken((prev) => (prev === null ? false : prev));
    }, 1500);
    return () => {
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pwd.length < 10) {
      setError('Parola trebuie să aibă cel puțin 10 caractere.');
      return;
    }
    if (pwd !== pwd2) {
      setError('Parolele nu coincid.');
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabase(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error: err } = await supabase.auth.updateUser({ password: pwd });
      if (err) {
        setError(err.message);
        return;
      }
      setDone(true);
      // Redirect to login after a beat so the user sees the confirmation.
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare neașteptată.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-100"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.18), transparent 55%)',
      }}
    >
      <div className="w-full max-w-sm space-y-4">
        <Link
          href="/login"
          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-1 text-xs font-medium text-zinc-500 transition-colors hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Conectare
        </Link>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-100">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/30">
              <KeyRound className="h-4 w-4 text-violet-300" aria-hidden />
            </span>
            Setează o parolă nouă
          </h1>

          {hasToken === false ? (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              <p className="font-semibold">Link expirat sau invalid</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-300/90">
                Cere un nou link de resetare la{' '}
                <Link
                  href="/login/forgot"
                  className="font-medium underline decoration-amber-300/60 underline-offset-2 transition-colors hover:text-amber-100"
                >
                  Am uitat parola
                </Link>
                .
              </p>
            </div>
          ) : done ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              <p className="font-semibold">Parolă schimbată</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-300/90">
                Te redirecționăm la conectare…
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Parolă nouă
                </span>
                <input
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
                <span className="mt-1 block text-[11px] text-zinc-500">
                  Minim 10 caractere.
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Confirmă parola
                </span>
                <input
                  type="password"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
              </label>
              {error ? (
                <p className="text-xs font-medium text-rose-400">{error}</p>
              ) : null}
              <Button
                type="submit"
                disabled={submitting || hasToken !== true}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Schimbă parola
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
