'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';
import { createBrowserSupabase } from '@hir/supabase-types';
import { Button } from '@hir/ui';

// Forgot-password flow. Supabase auth.resetPasswordForEmail() emails the
// user a magic link that lands on /login/reset?type=recovery. The reset
// page consumes the token and lets the user pick a new password via
// supabase.auth.updateUser({ password }).
//
// This is the audit P2 #10 fix — invited couriers who forgot their initial
// password no longer have to ping the dispatcher to reset it manually.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabase(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/login/reset`,
      });
      if (err) {
        setError(err.message);
        return;
      }
      setSent(true);
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
          Înapoi la conectare
        </Link>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Am uitat parola</h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Îți trimitem un link pe email. Apeși pe el și îți alegi o parolă
            nouă.
          </p>

          {sent ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              <p className="font-semibold">Email trimis</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-300/90">
                Verifică inbox-ul (și folderul de spam) pentru un link de la
                noreply@hirforyou.ro. Linkul expiră în 1 oră.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Email
                </span>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                    aria-hidden
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    inputMode="email"
                    placeholder="curier@exemplu.ro"
                    className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>
              </label>
              {error ? (
                <p className="text-xs font-medium text-rose-400">{error}</p>
              ) : null}
              <Button
                type="submit"
                disabled={submitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Trimite linkul de resetare
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
