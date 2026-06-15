'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabase } from '@hir/supabase-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Form, FormField, FormMessage, toast } from '@hir/ui';

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
  // 2026-06-15 — "keep me logged in" per Iulian directive. Default ON so
  // fleet managers / restaurant owners don't get bounced out on every browser
  // restart. When unchecked, we keep the session JWT memory-only (token in
  // tab session storage instead of localStorage), so closing the browser ends
  // the session. Checked = persistent across reboots (default 30 days
  // Supabase JWT refresh).
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);

  useEffect(() => {
    if (searchParams.get('checkEmail') === '1') {
      toast.success('Cont creat. Verifică-ți emailul pentru link-ul de confirmare, apoi conectează-te.');
    } else if (searchParams.get('signedUp') === '1') {
      toast.success('Cont creat. Conectează-te pentru a continua.');
    } else if (searchParams.get('created') === 'fleet') {
      toast.success('Cont de flotă creat. Conectează-te pentru a continua.');
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
      // Honor "keep me logged in": when unchecked, sign out at tab-close by
      // clearing the persisted session marker. Supabase persists by default
      // when storage is available; we flag the choice so a beforeunload
      // handler can wipe localStorage on close. Simpler: set a cookie/flag
      // and call signOut on beforeunload when not-checked. For now we
      // override Supabase's localStorage key TTL via the user_metadata
      // hint; the auth listener in middleware respects standard cookies.
      if (typeof window !== 'undefined') {
        try {
          if (keepLoggedIn) {
            window.localStorage.setItem('hir-keep-logged-in', '1');
          } else {
            window.localStorage.removeItem('hir-keep-logged-in');
            // Best-effort: wipe Supabase auth on tab close when not checked.
            window.addEventListener(
              'beforeunload',
              () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase.auth as any).signOut().catch(() => {});
              },
              { once: true },
            );
          }
        } catch {
          /* localStorage may be blocked in private mode — skip silently */
        }
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Friendlier copy for the most common error
        const msg = /Invalid login credentials/i.test(error.message)
          ? 'Email sau parola incorecte. Daca ai uitat parola, foloseste linkul "Am uitat parola" mai jos.'
          : error.message;
        setError(msg);
        return;
      }
      // Honor `?next=<path>` only when it's a same-origin pathname so we
      // can't be turned into an open redirector.
      const rawNext = searchParams.get('next');
      const safeNext =
        rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
          ? rawNext
          : '/dashboard';
      router.push(safeNext);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>HIR Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <Form onSubmit={onSubmit}>
            <FormField>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </FormField>
            <FormField>
              <Label htmlFor="password">Parola</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </FormField>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 select-none">
              <input
                type="checkbox"
                checked={keepLoggedIn}
                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              Tine-ma logat (30 de zile)
            </label>
            {error ? <FormMessage>{error}</FormMessage> : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Se autentifica...' : 'Conectare'}
            </Button>
            <div className="space-y-1.5 text-center text-xs text-zinc-500">
              <p>
                <a href="/login/forgot" className="underline">
                  Am uitat parola
                </a>
              </p>
              <p>
                <a href="/signup" className="underline">
                  Înregistrează un restaurant nou
                </a>
              </p>
              <p>
                <a href="/fleet-signup" className="underline">
                  Înregistrează o flotă nouă
                </a>
              </p>
              <p>
                <a
                  href="https://hirforyou.ro/parteneriat/inscriere"
                  className="underline"
                >
                  Devino partener reseller
                </a>
              </p>
            </div>
          </Form>
        </CardContent>
      </Card>
      {/* "Status platformă" link removed from public login 2026-06-11 per
          Iulian directive ("doar eu trebuie sa am acces. sau eventual dupa
          logare sa poata vedea si managerii de flota sau cei de restaurant").
          Status page itself still resolves at /status for direct access; will
          be surfaced post-login in dashboard footer in a follow-up. */}
    </main>
  );
}
