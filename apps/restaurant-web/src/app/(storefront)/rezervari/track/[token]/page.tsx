import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

type ReservationStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'NOSHOW'
  | 'COMPLETED';

type ReservationRow = {
  id: string;
  status: ReservationStatus;
  customer_first_name: string;
  party_size: number;
  requested_at: string;
  rejection_reason: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Rezervarea ta' };
}

function formatRequestedAt(iso: string): string {
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Bucharest',
  }).format(new Date(iso));
}

function StatusBlock({ status, reason }: { status: ReservationStatus; reason: string | null }) {
  if (status === 'CONFIRMED') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
        <h2 className="text-lg font-semibold text-emerald-900">Rezervare confirmată</h2>
        <p className="text-sm text-emerald-800">Te așteptăm la ora rezervată.</p>
      </div>
    );
  }
  if (status === 'REJECTED') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <XCircle className="h-10 w-10 text-rose-600" aria-hidden />
        <h2 className="text-lg font-semibold text-rose-900">Cerere respinsă</h2>
        <p className="text-sm text-rose-800">
          Restaurantul nu a putut accepta rezervarea ta.
        </p>
        {reason ? (
          <p className="mt-1 text-xs text-rose-700">
            <span className="font-medium">Motiv:</span> {reason}
          </p>
        ) : null}
      </div>
    );
  }
  if (status === 'CANCELLED') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <XCircle className="h-10 w-10 text-amber-600" aria-hidden />
        <h2 className="text-lg font-semibold text-amber-900">Rezervare anulată</h2>
        <p className="text-sm text-amber-800">Pentru o nouă rezervare, sună restaurantul.</p>
      </div>
    );
  }
  if (status === 'COMPLETED') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-zinc-600" aria-hidden />
        <h2 className="text-lg font-semibold text-zinc-900">Rezervare finalizată</h2>
        <p className="text-sm text-zinc-700">Mulțumim că ne-ai vizitat!</p>
      </div>
    );
  }
  if (status === 'NOSHOW') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center">
        <XCircle className="h-10 w-10 text-zinc-600" aria-hidden />
        <h2 className="text-lg font-semibold text-zinc-900">Marcată ca neonorată</h2>
        <p className="text-sm text-zinc-700">
          Pentru detalii, te rugăm să contactezi restaurantul.
        </p>
      </div>
    );
  }
  // REQUESTED — pending decision
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-purple-200 bg-purple-50 p-6 text-center">
      <Clock className="h-10 w-10 text-purple-600" aria-hidden />
      <h2 className="text-lg font-semibold text-purple-900">În așteptare</h2>
      <p className="text-sm text-purple-800">
        Restaurantul va confirma rezervarea în scurt timp.
      </p>
    </div>
  );
}

export default async function ReservationTrackPage({
  params,
}: {
  params: { token: string };
}) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) notFound();

  if (!UUID_RE.test(params.token)) notFound();

  const admin = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data } = await sb
    .from('reservations')
    .select(
      'id, status, customer_first_name, party_size, requested_at, rejection_reason',
    )
    .eq('tenant_id', tenant.id)
    .eq('public_track_token', params.token)
    .maybeSingle();

  if (!data) notFound();
  const resv = data as ReservationRow;

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-900">
          ← Înapoi la meniu
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Rezervarea ta
        </h1>
        <p className="mt-1 text-sm text-zinc-500">la {tenant.name}</p>
      </div>

      <StatusBlock status={resv.status} reason={resv.rejection_reason} />

      <dl className="mt-6 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-zinc-500">Nume</dt>
          <dd className="font-medium text-zinc-900">{resv.customer_first_name}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-500">Persoane</dt>
          <dd className="font-medium text-zinc-900">{resv.party_size}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-500">Data</dt>
          <dd className="font-medium text-zinc-900">
            {formatRequestedAt(resv.requested_at)}
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-center text-xs text-zinc-400">
        Pagina se actualizează automat — reîmprospătează pentru cel mai recent status.
      </p>
    </main>
  );
}
