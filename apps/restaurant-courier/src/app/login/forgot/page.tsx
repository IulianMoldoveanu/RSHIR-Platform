'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';
import { createBrowserSupabase } from '@hir/supabase-types';

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="w-full max-w-sm space-y-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Înapoi la conectare
        </Link>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <h1 className="text-base font-semibold text-zinc-100">Am uitat parola</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Îți trimitem un link pe email. Apasă pe el și alegi o parolă nouă.
          </p>

          {sent ? (
            <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">
              <p className="font-medium">Email trimis.</p>
              <p className="mt-1 text-xs text-emerald-300/80">
                Verifică inbox-ul (+ folder-ul de spam) pentru un link de la
                noreply@hirforyou.ro. Linkul expiră în 1 oră.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-zinc-400">
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
                    placeholder="curier@exemplu.ro"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </label>
              {error ? (
                <p className="text-xs text-rose-400">{error}</p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Trimite linkul de resetare
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
