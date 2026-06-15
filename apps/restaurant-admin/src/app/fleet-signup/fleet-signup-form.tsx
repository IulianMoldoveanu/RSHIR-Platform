'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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
// Romanian CUI accepts both "RO12345678" and plain digits 2-10 chars.
const CUI_RE = /^(RO)?\d{2,10}$/i;

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

export function FleetSignupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [cui, setCui] = useState('');
  const [phone, setPhone] = useState('');
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
        const r = await fetch(`/api/fleet-signup/check-slug?slug=${encodeURIComponent(slug)}`);
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

    if (!CUI_RE.test(cui.trim())) {
      setError('CUI invalid. Format: RO12345678 sau 12345678.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 9) {
      setError('Telefon invalid (minim 9 cifre).');
      return;
    }
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
      const res = await fetch('/api/fleet-signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug, cui, phone, email, password }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        autoConfirmed?: boolean;
      };
      if (!res.ok) {
        setError(json.error || 'Eroare la creare cont.');
        setSubmitting(false);
        return;
      }
      // Email is auto-confirmed server-side (see /api/fleet-signup). Fleet
      // manager can log in immediately; KYF approval gates dispatch access.
      router.push('/login?created=fleet');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Eroare neașteptată.');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Date flotă + cont admin</CardTitle>
      </CardHeader>
      <CardContent>
        <Form onSubmit={onSubmit}>
          <FormField>
            <Label htmlFor="name">Nume firmă flotă *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Flota Express București"
              maxLength={100}
              required
            />
          </FormField>

          <FormField>
            <Label htmlFor="slug">Slug (identificator URL) *</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="flota-express-bucuresti"
              maxLength={30}
              required
            />
            {slugStatus.state === 'checking' ? (
              <p className="text-xs text-zinc-500">Verific disponibilitatea…</p>
            ) : slugStatus.state === 'available' ? (
              <p className="text-xs text-emerald-700">Slug disponibil ✓</p>
            ) : slugStatus.state === 'taken' ? (
              <p className="text-xs text-rose-700">Slug deja folosit — alege altul.</p>
            ) : slugStatus.state === 'invalid' && slug.length > 0 ? (
              <p className="text-xs text-rose-700">
                {'3-30 caractere, doar litere mici, cifre, „-".'}
              </p>
            ) : null}
          </FormField>

          <FormField>
            <Label htmlFor="cui">CUI firmă flotă *</Label>
            <Input
              id="cui"
              value={cui}
              onChange={(e) => setCui(e.target.value.trim())}
              placeholder="RO46864293"
              maxLength={12}
              required
            />
            <p className="text-xs text-zinc-500">
              Va fi verificat la ANAF după înregistrare.
            </p>
          </FormField>

          <FormField>
            <Label htmlFor="phone">Telefon contact *</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+40 743 700 916"
              autoComplete="tel"
              required
            />
          </FormField>

          <FormField>
            <Label htmlFor="email">Email administrator flotă *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@flota-ta.ro"
              autoComplete="email"
              required
            />
          </FormField>

          <FormField>
            <Label htmlFor="password">Parolă (minim 10 caractere) *</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              maxLength={72}
              required
            />
          </FormField>

          <FormField>
            <Label htmlFor="confirm">Confirmă parola *</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              maxLength={72}
              required
            />
          </FormField>

          {error ? <FormMessage>{error}</FormMessage> : null}

          <Button type="submit" disabled={submitting || slugStatus.state === 'checking'}>
            {submitting ? 'Se creează contul…' : 'Creează flotă + cont'}
          </Button>

          <p className="text-center text-[11px] leading-relaxed text-zinc-500">
            După înregistrare primești email de confirmare. La prima logare
            te trimitem la <strong>KYF</strong> (Know Your Fleet) — uploadezi
            act constitutiv, extras cont și certificat ONRC. Flota devine
            activă după aprobare manuală (24h).
          </p>
        </Form>
      </CardContent>
    </Card>
  );
}
