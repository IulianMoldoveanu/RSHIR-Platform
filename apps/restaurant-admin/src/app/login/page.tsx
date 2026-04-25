'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabase } from '@hir/supabase-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Form, FormField, FormMessage, toast } from '@hir/ui';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (searchParams.get('checkEmail') === '1') {
      toast.success('Cont creat. Verifică-ți emailul pentru link-ul de confirmare, apoi conectează-te.');
    } else if (searchParams.get('signedUp') === '1') {
      toast.success('Cont creat. Conectează-te pentru a continua.');
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
      router.push('/dashboard');
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
            {error ? <FormMessage>{error}</FormMessage> : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Se autentifica...' : 'Conectare'}
            </Button>
            <p className="text-center text-xs text-zinc-500">
              <a href="/signup" className="underline">
                Înregistrează un restaurant nou
              </a>
            </p>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
