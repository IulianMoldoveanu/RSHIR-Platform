'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabase } from '@hir/supabase-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Form, FormField, FormMessage, toast } from '@hir/ui';
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-10">
      {/* Logo / wordmark */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500 text-3xl font-black text-white shadow-lg shadow-violet-500/30">
          H
        </div>
        <span className="text-lg font-bold tracking-tight text-zinc-100">HIR Curier</span>
        <span className="text-xs text-zinc-500">Platforma de livrări HIR</span>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h1 className="mb-5 text-base font-semibold text-zinc-100">Conectare</h1>
        <Form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField>
            <Label htmlFor="email" className="text-[11px] font-medium text-zinc-400">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="mt-1"
            />
          </FormField>
          <FormField>
            <Label htmlFor="password" className="text-[11px] font-medium text-zinc-400">Parola</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1"
            />
          </FormField>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Button
            type="submit"
            disabled={submitting}
            className="mt-1 h-12 w-full rounded-xl bg-violet-500 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
          >
            {submitting ? 'Se autentifică...' : 'Conectare'}
          </Button>
        </Form>

        <div className="mt-5 flex flex-col items-center gap-2 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
          <a href="/login/forgot" className="hover:text-violet-400">
            Am uitat parola
          </a>
          <a href="/register" className="hover:text-violet-400">
            Cum devin curier HIR?
          </a>
        </div>
      </div>
    </main>
  );
}
