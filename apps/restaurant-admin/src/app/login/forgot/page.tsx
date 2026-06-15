'use client';

export const dynamic = 'force-dynamic';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createBrowserSupabase } from '@hir/supabase-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Form, FormField, FormMessage } from '@hir/ui';

// /login/forgot — fleet managers / restaurant owners / resellers request
// a password reset email. Supabase's resetPasswordForEmail triggers a
// recovery email via the configured SMTP (Resend, branded HIR) with a
// link to /login/reset. The recovery flow is the same for all 3 roles.

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabase(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const redirectTo = `${window.location.origin}/login/reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        setError(error.message);
        return;
      }
      setSent(true);
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
          <CardTitle>Resetare parolă</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-700">
                ✓ Email trimis. Verifică inboxul (inclusiv folderul Spam/Promoții) pentru un email de la
                <strong> noreply@hirforyou.ro</strong>.
              </p>
              <p className="text-xs text-zinc-600">
                Linkul expiră în 1 oră. După click, vei putea seta o parolă nouă.
              </p>
              <Link href="/login" className="block text-center text-xs text-indigo-600 underline">
                Înapoi la logare
              </Link>
            </div>
          ) : (
            <Form onSubmit={onSubmit}>
              <p className="text-xs text-zinc-600">
                Introdu emailul contului tău. Vei primi un link de resetare.
              </p>
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
              {error ? <FormMessage>{error}</FormMessage> : null}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Se trimite...' : 'Trimite link de resetare'}
              </Button>
              <p className="text-center text-xs">
                <Link href="/login" className="text-indigo-600 underline">
                  Înapoi la logare
                </Link>
              </p>
            </Form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
