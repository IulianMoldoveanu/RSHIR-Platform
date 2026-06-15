'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@hir/supabase-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Form, FormField, FormMessage } from '@hir/ui';

// /login/reset — landing page for recovery + invite links. Supabase's
// verify endpoint redirects here with the session in the URL fragment
// (#access_token=...&type=recovery). createBrowserSupabase with
// detectSessionInUrl: true consumes the fragment automatically on mount,
// then we let the user set a new password and bounce them to /dashboard
// (or /fleet via the dashboard layout's role routing).

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Give Supabase a tick to consume the URL fragment + set session.
    const supabase = createBrowserSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setReady(true);
      else {
        // Maybe the fragment hasn't been parsed yet — try again shortly.
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getSession();
          if (!cancelled) setReady(Boolean(d2.session));
        }, 300);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pwd.length < 10) {
      setError('Parola trebuie să aibă minim 10 caractere.');
      return;
    }
    if (pwd !== confirm) {
      setError('Parolele nu coincid.');
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabase(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) {
        setError(error.message);
        return;
      }
      // Bounce to /dashboard — the dashboard layout routes per role
      // (FLEET -> /fleet, RESELLER -> /partner-portal).
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Eroare neasteptata.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Setează o parolă nouă</CardTitle>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-zinc-600">Se verifică linkul de resetare…</p>
              <p className="text-xs text-zinc-500">
                Dacă pagina rămâne așa, linkul e expirat. Cere unul nou la{' '}
                <a href="/login/forgot" className="text-indigo-600 underline">
                  /login/forgot
                </a>
                .
              </p>
            </div>
          ) : (
            <Form onSubmit={onSubmit}>
              <p className="text-xs text-zinc-600">Alege o parolă nouă (minim 10 caractere).</p>
              <FormField>
                <Label htmlFor="pwd">Parolă nouă</Label>
                <Input
                  id="pwd"
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </FormField>
              <FormField>
                <Label htmlFor="confirm">Confirmă parola</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </FormField>
              {error ? <FormMessage>{error}</FormMessage> : null}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Se salvează...' : 'Setează parola și intră în cont'}
              </Button>
            </Form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
