'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabase } from '@hir/supabase-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Form, FormField, FormMessage, toast } from '@hir/ui';
import { Eye, EyeOff } from 'lucide-react';
import { safeRedirectPath } from '@/lib/safe-redirect';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      toast.success('Cont creat. Conectează-te pentru a începe tura.');
    }
  }, [searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabase(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      const next = safeRedirectPath(searchParams.get('next'));
      router.push(next);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Eroare neașteptată');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-10"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.18), transparent 55%)',
      }}
    >
      {/* Logo — MOV-1 brand icon (same asset as the launcher/PWA icon) */}
      <div className="mb-8 flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt="HIR Curier"
          width={80}
          height={80}
          className="h-20 w-20 rounded-2xl shadow-xl shadow-violet-500/40 ring-1 ring-violet-400/30"
        />
        <span className="text-xs text-zinc-500">Platforma de livrări HIR</span>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-2xl shadow-black/40 backdrop-blur">
        <h1 className="mb-5 text-lg font-semibold tracking-tight text-zinc-100">Conectare</h1>
        <Form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField>
            <Label
              htmlFor="email"
              className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
            >
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              inputMode="email"
              className="mt-1"
            />
          </FormField>
          <FormField>
            <Label
              htmlFor="password"
              className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
            >
              Parolă
            </Label>
            <div className="relative mt-1">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                autoComplete="current-password"
                required
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Ascunde parola' : 'Arată parola'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-[-2px]"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden />
                )}
              </button>
            </div>
            {capsLock ? (
              <p
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-300"
                role="status"
              >
                <span aria-hidden>⇪</span> Caps Lock este activat
              </p>
            ) : null}
          </FormField>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Button
            type="submit"
            disabled={submitting}
            className="mt-1 h-12 w-full rounded-xl bg-violet-500 text-sm font-semibold text-white shadow-md shadow-violet-500/30 transition-all hover:bg-violet-400 hover:shadow-lg hover:shadow-violet-500/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {submitting ? 'Se autentifică…' : 'Conectare'}
          </Button>
        </Form>

        <div className="mt-5 flex flex-col items-center gap-2 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
          <a
            href="/login/forgot"
            className="rounded px-1 transition-colors hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            Am uitat parola
          </a>
          <a
            href="/register"
            className="rounded px-1 transition-colors hover:text-violet-300 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
          >
            Cum devin curier HIR?
          </a>
        </div>
      </div>

      <p className="mt-8 text-center text-[11px] text-zinc-600">
        © {new Date().getFullYear()} HIR for You · curieri partenerii noștri
      </p>
    </main>
  );
}
