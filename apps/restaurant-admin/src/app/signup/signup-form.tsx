'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@hir/supabase-types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Form,
  FormField,
  FormMessage,
} from '@hir/ui';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

type SlugStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'invalid' }
  | { state: 'taken' };

export function SignupForm({ referralCode }: { referralCode?: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ state: 'idle' });

  // Auto-suggest slug from name until the user edits the slug field.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  // Debounced slug availability check.
  const reqIdRef = useRef(0);
  useEffect(() => {
    if (!slug) {
      setSlugStatus({ state: 'idle' });
      return;
    }
    if (slug.length < 3 || slug.length > 30 || !SLUG_RE.test(slug)) {
      setSlugStatus({ state: 'invalid' });
      return;
    }
    setSlugStatus({ state: 'checking' });
    const myReqId = ++reqIdRef.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/signup/check-slug?slug=${encodeURIComponent(slug)}`);
        const j = (await r.json()) as { available?: boolean };
        if (myReqId !== reqIdRef.current) return;
        setSlugStatus({ state: j.available ? 'available' : 'taken' });
      } catch {
        if (myReqId !== reqIdRef.current) return;
        setSlugStatus({ state: 'idle' });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError('Parola trebuie să aibă minim 10 caractere.');
      return;
    }
    if (password !== confirm) {
      setError('Parolele nu coincid.');
      return;
    }
    if (slugStatus.state === 'taken') {
      setError('Slug indisponibil — alege altul.');
      return;
    }
    if (slugStatus.state === 'invalid') {
      setError('Slug invalid (3-30 caractere, doar litere mici, cifre, "-").');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug, email, password, ...(referralCode ? { ref: referralCode } : {}) }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        requiresEmailConfirmation?: boolean;
      };
      if (!res.ok) {
        if (res.status === 409) setSlugStatus({ state: 'taken' });
        setError(json.error ?? 'Nu am putut crea contul.');
        setSubmitting(false);
        return;
      }

      // RSHIR-16: email_confirm is no longer auto-set; user must click link
      // before sign-in works. Send them to login with a "check inbox" banner.
      const params = new URLSearchParams({ email, checkEmail: '1' });
      router.push(`/login?${params.toString()}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Eroare neașteptată');
      setSubmitting(false);
    }
  }

  const slugHelp = (() => {
    switch (slugStatus.state) {
      case 'checking':
        return <span className="text-xs text-zinc-500">verificăm…</span>;
      case 'available':
        return <span className="text-xs text-emerald-600">slug disponibil</span>;
      case 'taken':
        return <span className="text-xs text-red-600">slug indisponibil</span>;
      case 'invalid':
        return (
          <span className="text-xs text-red-600">
            3-30 caractere, litere mici, cifre, &quot;-&quot;
          </span>
        );
      default:
        return null;
    }
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Înregistrează un restaurant nou</CardTitle>
      </CardHeader>
      <CardContent>
        <Form onSubmit={onSubmit}>
          <FormField>
            <Label htmlFor="name">Nume restaurant</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="organization"
            />
          </FormField>
          <FormField>
            <Label htmlFor="slug">Slug (subdomeniu)</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugTouched(true);
              }}
              required
              minLength={3}
              maxLength={30}
              pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
            />
            {slugHelp}
          </FormField>
          <FormField>
            <Label htmlFor="email">Email proprietar</Label>
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
            <Label htmlFor="password">Parola (min 10 caractere)</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          <Button
            type="submit"
            disabled={submitting || slugStatus.state === 'taken' || slugStatus.state === 'invalid'}
          >
            {submitting ? 'Se creează contul…' : 'Creează cont'}
          </Button>
          <p className="text-center text-xs text-zinc-500">
            Ai deja cont?{' '}
            <a href="/login" className="underline">
              Conectare
            </a>
          </p>
        </Form>
      </CardContent>
    </Card>
  );
}
