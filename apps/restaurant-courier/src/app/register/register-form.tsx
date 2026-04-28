'use client';

import { useState, type FormEvent } from 'react';
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
import { registerCourierAction } from './actions';

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vehicleType, setVehicleType] = useState<'BIKE' | 'SCOOTER' | 'CAR'>('SCOOTER');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError('Parola trebuie să aibă minim 10 caractere.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await registerCourierAction({
        fullName,
        phone,
        email,
        password,
        vehicleType,
      });
      if (!result.ok) {
        setError(result.error);
        setSubmitting(false);
        return;
      }
      const params = new URLSearchParams({ email, registered: '1' });
      router.push(`/login?${params.toString()}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Eroare neașteptată');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cont nou de curier</CardTitle>
      </CardHeader>
      <CardContent>
        <Form onSubmit={onSubmit}>
          <FormField>
            <Label htmlFor="fullName">Nume complet</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
          </FormField>
          <FormField>
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
              placeholder="07xxxxxxxx"
            />
          </FormField>
          <FormField>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </FormField>
          <FormField>
            <Label htmlFor="password">Parola (min 10 caractere)</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
            />
          </FormField>
          <FormField>
            <Label htmlFor="vehicleType">Mijloc de transport</Label>
            <select
              id="vehicleType"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as 'BIKE' | 'SCOOTER' | 'CAR')}
              className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="BIKE">Bicicletă</option>
              <option value="SCOOTER">Scuter / Motocicletă</option>
              <option value="CAR">Mașină</option>
            </select>
          </FormField>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Button type="submit" disabled={submitting}>
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
