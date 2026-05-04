'use client';

import { useState, useTransition } from 'react';
import { approveAffiliateApplication, rejectAffiliateApplication } from './actions';

type AppRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  audience_type: string;
  audience_size: number | null;
  channels: string[];
  pitch: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  partner_id: string | null;
};

const AUDIENCE_LABELS: Record<string, string> = {
  CREATOR: 'Creator/Influencer',
  BLOGGER: 'Blogger',
  CONSULTANT: 'Consultant',
  EXISTING_TENANT: 'Tenant HIR existent',
  OTHER: 'Altceva',
};

export function AffiliatesClient({ applications }: { applications: AppRow[] }) {
  if (applications.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-white p-10 text-center">
        <p className="text-sm font-medium">Niciuna în această stare.</p>
        <p className="mt-1 text-xs text-[#94a3b8]">Schimbă tab-ul ca să vezi alte aplicații.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {applications.map((app) => (
        <ApplicationCard key={app.id} app={app} />
      ))}
    </div>
  );
}

function ApplicationCard({ app }: { app: AppRow }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const isExistingTenant = app.audience_type === 'EXISTING_TENANT';
  const projectedBounty = isExistingTenant ? 600 : 300;

  function approve() {
    setError(null);
    startTransition(async () => {
      const r = await approveAffiliateApplication({ application_id: app.id, notes: notes || undefined });
      if (!r.ok) setError(r.error);
      else setDone(`Aprobat. Partner ${r.partner_id.substring(0, 8)}…`);
    });
  }

  function reject(spam = false) {
    setError(null);
    startTransition(async () => {
      const r = await rejectAffiliateApplication({ application_id: app.id, notes: notes || undefined, spam });
      if (!r.ok) setError(r.error);
      else setDone(spam ? 'Marcat spam' : 'Respins');
    });
  }

  return (
    <article className={`overflow-hidden rounded-lg border bg-white ${done ? 'border-[#A7F3D0]' : 'border-[#E2E8F0]'}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#F8FAFC]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <div className="truncate font-medium">{app.full_name}</div>
            <Pill audienceType={app.audience_type} />
            {isExistingTenant ? <span className="rounded bg-[#EEF2FF] px-1.5 py-0.5 text-xs font-medium text-[#4F46E5]">600 RON</span> : <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs text-[#475569]">300 RON</span>}
          </div>
          <div className="mt-1 truncate text-xs text-[#94a3b8]">
            {app.email} · {new Date(app.created_at).toLocaleDateString('ro-RO')} · {app.channels.length} canale
          </div>
        </div>
        <span className="text-xs text-[#94a3b8]">{open ? '▲' : '▼'}</span>
      </button>

      {open ? (
        <div className="border-t border-[#E2E8F0] bg-[#FAFAFA] px-5 py-4">
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <Field label="Telefon" value={app.phone ?? '—'} />
            <Field label="Mărime audiență" value={app.audience_size ? app.audience_size.toLocaleString('ro-RO') : '—'} />
            <Field label="Canale" value={app.channels.join(', ') || '—'} />
            <Field label="Bounty proiectat" value={`${projectedBounty} RON / restaurant`} />
          </dl>
          <div className="mt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[#475569]">Pitch</div>
            <p className="mt-1.5 whitespace-pre-wrap rounded-md border border-[#E2E8F0] bg-white p-3 text-sm leading-relaxed">
              {app.pitch}
            </p>
          </div>

          {app.status === 'PENDING' ? (
            <>
              <label className="mt-4 block">
                <span className="text-xs font-medium uppercase tracking-wide text-[#475569]">Notă (opțional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="mt-1.5 w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || !!done}
                  onClick={approve}
                  className="inline-flex items-center rounded-md bg-[#047857] px-4 py-2 text-sm font-medium text-white hover:bg-[#065F46] disabled:opacity-50"
                >
                  Aprobă ({projectedBounty} RON)
                </button>
                <button
                  type="button"
                  disabled={pending || !!done}
                  onClick={() => reject(false)}
                  className="inline-flex items-center rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                  Respinge
                </button>
                <button
                  type="button"
                  disabled={pending || !!done}
                  onClick={() => reject(true)}
                  className="inline-flex items-center rounded-md border border-[#FECACA] bg-white px-4 py-2 text-sm font-medium text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
                >
                  Spam
                </button>
              </div>
              {error ? <div className="mt-3 text-sm text-[#B91C1C]">{error}</div> : null}
              {done ? <div className="mt-3 text-sm text-[#047857]">{done} ✓</div> : null}
            </>
          ) : (
            <div className="mt-4 text-xs text-[#94a3b8]">
              Status: <strong>{app.status}</strong>
              {app.reviewed_at ? ` · revizuit ${new Date(app.reviewed_at).toLocaleDateString('ro-RO')}` : ''}
              {app.reviewer_notes ? <div className="mt-1.5 italic">{app.reviewer_notes}</div> : null}
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function Pill({ audienceType }: { audienceType: string }) {
  return (
    <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs text-[#475569]">
      {AUDIENCE_LABELS[audienceType] ?? audienceType}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[#475569]">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}
